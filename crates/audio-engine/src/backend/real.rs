//! GStreamer-backed implementation of [`Backend`]. Uses `playbin3` per
//! slot (decoding/output plumbing GStreamer already does well), with an
//! `equalizer-10bands` + `scaletempo` filter bin inserted via
//! `audio-filter` for EQ and pitch-preserving speed control. Output goes
//! through `pipewiresink` explicitly (Linux/Omarchy-first, spec §13)
//! rather than a generic auto-detected sink.
//!
//! Gapless (spec §12) uses playbin3's own `about-to-finish` signal —
//! the standard, glitch-free mechanism for it. Crossfade is deliberately
//! *not* implemented as in-process audio mixing: two independent
//! `playbin3` slots each play to their own `pipewiresink`, and PipeWire
//! itself mixes concurrent client streams (exactly like two unrelated
//! apps playing at once) — `Player`'s volume ramp on both slots during a
//! transition is what makes that mixing sound like a crossfade. This
//! avoids an in-process `audiomixer` bin entirely.
//!
//! The 10-band EQ and pitch-preserving speed control depend on
//! `gst-plugins-good` (`equalizer-10bands`, `scaletempo`), which isn't
//! part of the minimal GStreamer install — if those elements aren't
//! available, this backend logs a warning and runs without them rather
//! than failing to start (spec §27: never let an optional feature take
//! the whole app down).

use super::{Backend, BackendEvent};
use crate::error::{Error, Result};
use crate::types::{AudioDevice, Slot, EQ_BAND_COUNT};
use gstreamer::prelude::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

struct FilterBin {
    bin: gstreamer::Bin,
    eq_bands: Option<[gstreamer::Element; EQ_BAND_COUNT]>,
}

struct GstSlot {
    playbin: gstreamer::Element,
    gapless_next: Arc<Mutex<Option<String>>>,
    filter: FilterBin,
    /// Populated by the `about-to-finish` signal callback, which fires
    /// from GStreamer's streaming thread — `poll_events` drains this
    /// alongside bus messages so `Player` learns about a gapless switch
    /// exactly once, the same way it learns about EOS/errors.
    signal_events: Arc<Mutex<Vec<BackendEvent>>>,
}

pub struct GstreamerBackend {
    slots: HashMap<Slot, GstSlot>,
}

impl GstreamerBackend {
    pub fn new() -> Result<Self> {
        gstreamer::init().map_err(|e| Error::Pipeline(format!("gstreamer init failed: {e}")))?;

        let mut slots = HashMap::new();
        slots.insert(Slot::A, Self::build_slot()?);
        slots.insert(Slot::B, Self::build_slot()?);

        Ok(Self { slots })
    }

    /// Live device enumeration — always queried fresh rather than cached,
    /// so a device id is never stale by the time it's acted on (a cached
    /// `id -> Device` map keyed by enumeration order would silently point
    /// at the wrong hardware if a device was unplugged/replugged between
    /// listing and selecting it).
    fn enumerate_output_devices() -> Vec<gstreamer::Device> {
        let monitor = gstreamer::DeviceMonitor::new();
        monitor.add_filter(Some("Audio/Sink"), None);
        if monitor.start().is_err() {
            tracing::warn!("failed to start GStreamer device monitor");
            return Vec::new();
        }
        let devices = monitor.devices().into_iter().collect();
        monitor.stop();
        devices
    }

    fn build_slot() -> Result<GstSlot> {
        let playbin = gstreamer::ElementFactory::make("playbin3")
            .build()
            .map_err(|e| Error::Pipeline(format!("failed to create playbin3: {e}")))?;

        let sink = gstreamer::ElementFactory::make("pipewiresink")
            .build()
            .map_err(|e| Error::Pipeline(format!("failed to create pipewiresink: {e}")))?;
        playbin.set_property("audio-sink", &sink);

        let filter = build_filter_bin();
        if let Some(bin) = filter.bin_if_present() {
            playbin.set_property("audio-filter", bin);
        }

        let gapless_next: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
        let signal_events: Arc<Mutex<Vec<BackendEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let signal_uri_cell = gapless_next.clone();
        let signal_events_cell = signal_events.clone();
        let signal_playbin = playbin.clone();
        playbin.connect("about-to-finish", false, move |_| {
            if let Some(uri) = signal_uri_cell.lock().unwrap().take() {
                signal_playbin.set_property("uri", &uri);
                signal_events_cell
                    .lock()
                    .unwrap()
                    .push(BackendEvent::AdvancedToGaplessNext);
            }
            None
        });

        Ok(GstSlot {
            playbin,
            gapless_next,
            filter,
            signal_events,
        })
    }

    fn slot(&self, slot: Slot) -> &GstSlot {
        self.slots
            .get(&slot)
            .expect("both slots are always present")
    }

    fn slot_mut(&mut self, slot: Slot) -> &mut GstSlot {
        self.slots
            .get_mut(&slot)
            .expect("both slots are always present")
    }
}

/// A single `equalizer-10bands` + `scaletempo` bin, tolerant of either
/// element being unavailable (see module docs).
fn build_filter_bin() -> FilterBin {
    let bin = gstreamer::Bin::new();
    let eq = gstreamer::ElementFactory::make("equalizer-10bands")
        .build()
        .ok();
    let scaletempo = gstreamer::ElementFactory::make("scaletempo").build().ok();

    if eq.is_none() {
        tracing::warn!("equalizer-10bands unavailable (install gst-plugins-good); EQ disabled");
    }
    if scaletempo.is_none() {
        tracing::warn!(
            "scaletempo unavailable (install gst-plugins-good); playback speed will shift pitch"
        );
    }

    let mut chain: Vec<gstreamer::Element> = Vec::new();
    if let Some(eq) = &eq {
        chain.push(eq.clone());
    }
    if let Some(st) = &scaletempo {
        chain.push(st.clone());
    }

    if chain.is_empty() {
        return FilterBin {
            bin,
            eq_bands: None,
        };
    }

    for element in &chain {
        bin.add(element)
            .expect("adding a freshly-created element to an empty bin cannot fail");
    }
    if chain.len() > 1 {
        gstreamer::Element::link_many(chain.iter().collect::<Vec<_>>())
            .expect("linking a freshly-built linear chain cannot fail");
    }

    let first_sink = chain.first().unwrap().static_pad("sink").unwrap();
    let last_src = chain.last().unwrap().static_pad("src").unwrap();
    let sink_ghost = gstreamer::GhostPad::with_target(&first_sink).unwrap();
    let src_ghost = gstreamer::GhostPad::with_target(&last_src).unwrap();
    bin.add_pad(&sink_ghost).unwrap();
    bin.add_pad(&src_ghost).unwrap();

    let eq_bands = eq.map(|eq| band_elements(&eq));
    FilterBin { bin, eq_bands }
}

/// `equalizer-10bands` exposes each band as a `band<N>` property on the
/// element itself (not separate child elements) — we keep a reference to
/// the one element ten times purely so `set_eq_band`'s call site doesn't
/// need to special-case "one element, ten properties."
fn band_elements(eq: &gstreamer::Element) -> [gstreamer::Element; EQ_BAND_COUNT] {
    std::array::from_fn(|_| eq.clone())
}

impl FilterBin {
    fn bin_if_present(&self) -> Option<&gstreamer::Bin> {
        self.eq_bands.is_some().then_some(&self.bin)
    }
}

impl Backend for GstreamerBackend {
    fn load(&mut self, slot: Slot, uri: &str) -> Result<()> {
        let gst_slot = self.slot(slot);
        gst_slot
            .playbin
            .set_state(gstreamer::State::Null)
            .map_err(|e| Error::Pipeline(e.to_string()))?;
        gst_slot.playbin.set_property("uri", uri);
        Ok(())
    }

    fn play(&mut self, slot: Slot) -> Result<()> {
        self.slot(slot)
            .playbin
            .set_state(gstreamer::State::Playing)
            .map(|_| ())
            .map_err(|e| Error::Pipeline(e.to_string()))
    }

    fn pause(&mut self, slot: Slot) -> Result<()> {
        self.slot(slot)
            .playbin
            .set_state(gstreamer::State::Paused)
            .map(|_| ())
            .map_err(|e| Error::Pipeline(e.to_string()))
    }

    fn stop(&mut self, slot: Slot) -> Result<()> {
        self.slot(slot)
            .playbin
            .set_state(gstreamer::State::Null)
            .map(|_| ())
            .map_err(|e| Error::Pipeline(e.to_string()))
    }

    fn seek(&mut self, slot: Slot, position_ms: u64) -> Result<()> {
        let playbin = &self.slot(slot).playbin;
        // A seek right after `load`+`play` can race playbin3's async
        // preroll (state change returns before the pipeline can actually
        // accept a seek) — wait for it to settle first. A caller resuming
        // playback at a saved position immediately after starting it is
        // a real case, not just a theoretical one.
        let _ = playbin.state(gstreamer::ClockTime::from_seconds(5));
        playbin
            .seek_simple(
                gstreamer::SeekFlags::FLUSH | gstreamer::SeekFlags::KEY_UNIT,
                gstreamer::ClockTime::from_mseconds(position_ms),
            )
            .map_err(|e| Error::Pipeline(e.to_string()))
    }

    fn set_volume(&mut self, slot: Slot, volume: f64) -> Result<()> {
        self.slot(slot)
            .playbin
            .set_property("volume", volume.clamp(0.0, 1.0));
        Ok(())
    }

    fn set_muted(&mut self, slot: Slot, muted: bool) -> Result<()> {
        self.slot(slot).playbin.set_property("mute", muted);
        Ok(())
    }

    fn set_playback_speed(&mut self, slot: Slot, rate: f64) -> Result<()> {
        // Normal speed never needs a seek-with-rate at all, which matters
        // because `Player` applies the stored rate to every freshly
        // loaded slot (including the common 1.0 case) before playback
        // starts — and a rate-seek on a not-yet-prerolled (NULL/READY)
        // pipeline fails outright. Real rate changes happen interactively
        // while a track is already playing/paused, so requiring at least
        // PAUSED here for non-1.0 rates matches how this is actually used.
        if rate == 1.0 {
            return Ok(());
        }
        let playbin = &self.slot(slot).playbin;
        let (_, current, _) = playbin.state(gstreamer::ClockTime::from_seconds(5));
        if current < gstreamer::State::Paused {
            return Ok(());
        }
        let position = playbin
            .query_position::<gstreamer::ClockTime>()
            .unwrap_or(gstreamer::ClockTime::ZERO);
        playbin
            .seek(
                rate,
                gstreamer::SeekFlags::FLUSH | gstreamer::SeekFlags::ACCURATE,
                gstreamer::SeekType::Set,
                position,
                gstreamer::SeekType::None,
                gstreamer::ClockTime::NONE,
            )
            .map_err(|e| Error::Pipeline(e.to_string()))
    }

    fn set_eq_band(&mut self, slot: Slot, band: usize, gain_db: f64) -> Result<()> {
        if band >= EQ_BAND_COUNT {
            return Err(Error::Pipeline(format!(
                "EQ band {band} out of range (0-{})",
                EQ_BAND_COUNT - 1
            )));
        }
        let Some(bands) = &self.slot(slot).filter.eq_bands else {
            // equalizer-10bands isn't installed; silently a no-op rather
            // than an error, since the feature is advertised as
            // best-effort when the optional plugin is missing.
            return Ok(());
        };
        bands[band].set_property(format!("band{band}").as_str(), gain_db.clamp(-24.0, 12.0));
        Ok(())
    }

    fn set_gapless_next(&mut self, slot: Slot, uri: Option<&str>) -> Result<()> {
        *self.slot_mut(slot).gapless_next.lock().unwrap() = uri.map(str::to_string);
        Ok(())
    }

    fn set_output_device(&mut self, slot: Slot, device_id: Option<&str>) -> Result<()> {
        let sink = match device_id {
            None => gstreamer::ElementFactory::make("pipewiresink")
                .build()
                .map_err(|e| Error::Pipeline(format!("failed to create pipewiresink: {e}")))?,
            Some(id) => {
                let device = Self::enumerate_output_devices()
                    .into_iter()
                    .find(|d| d.display_name() == id)
                    .ok_or_else(|| Error::DeviceNotFound(format!("unknown output device {id}")))?;
                device
                    .create_element(None)
                    .map_err(|e| Error::Pipeline(format!("failed to target device: {e}")))?
            }
        };
        self.slot(slot).playbin.set_property("audio-sink", &sink);
        Ok(())
    }

    fn position_ms(&self, slot: Slot) -> Option<u64> {
        self.slot(slot)
            .playbin
            .query_position::<gstreamer::ClockTime>()
            .map(|t| t.mseconds())
    }

    fn duration_ms(&self, slot: Slot) -> Option<u64> {
        self.slot(slot)
            .playbin
            .query_duration::<gstreamer::ClockTime>()
            .map(|t| t.mseconds())
    }

    fn list_output_devices(&self) -> Vec<AudioDevice> {
        Self::enumerate_output_devices()
            .into_iter()
            .enumerate()
            .map(|(index, device)| AudioDevice {
                id: device.display_name().to_string(),
                name: device.display_name().to_string(),
                is_default: index == 0,
            })
            .collect()
    }

    fn poll_events(&mut self, slot: Slot) -> Vec<BackendEvent> {
        let gst_slot = self.slot(slot);
        let mut events = std::mem::take(&mut *gst_slot.signal_events.lock().unwrap());

        let Some(bus) = gst_slot.playbin.bus() else {
            return events;
        };
        while let Some(message) =
            bus.pop_filtered(&[gstreamer::MessageType::Eos, gstreamer::MessageType::Error])
        {
            match message.view() {
                gstreamer::MessageView::Eos(_) => events.push(BackendEvent::Eos),
                gstreamer::MessageView::Error(err) => {
                    events.push(BackendEvent::Error(err.error().to_string()))
                }
                _ => {}
            }
        }
        events
    }
}
