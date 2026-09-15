//! A fully in-memory `Backend` with no GStreamer/hardware dependency at
//! all, so `Player`'s state-machine and crossfade-timing logic can be
//! exercised by `cargo test` on any machine, in CI, with no audio device
//! present — mirrors rgb-control-center's "simulated" backend pattern.

use super::{Backend, BackendEvent};
use crate::error::Result;
use crate::types::{AudioDevice, Slot, EQ_BAND_COUNT};
use std::collections::HashMap;

#[derive(Debug, Default, Clone)]
struct SlotState {
    uri: Option<String>,
    playing: bool,
    position_ms: u64,
    /// Fixed per-track "duration" so tests can simulate reaching EOS
    /// deterministically instead of depending on wall-clock time.
    duration_ms: Option<u64>,
    volume: f64,
    muted: bool,
    speed: f64,
    eq: [f64; EQ_BAND_COUNT],
    gapless_next: Option<String>,
    device_id: Option<String>,
    pending_events: Vec<BackendEvent>,
}

impl SlotState {
    fn new() -> Self {
        Self {
            volume: 1.0,
            speed: 1.0,
            ..Default::default()
        }
    }
}

pub struct SimulatedBackend {
    slots: HashMap<Slot, SlotState>,
    devices: Vec<AudioDevice>,
    /// URIs that `load` should fail for — lets tests simulate a corrupt or
    /// deleted file without needing a real, broken audio file on disk.
    failing_uris: std::collections::HashSet<String>,
}

impl SimulatedBackend {
    pub fn new() -> Self {
        Self {
            slots: HashMap::from([(Slot::A, SlotState::new()), (Slot::B, SlotState::new())]),
            devices: vec![AudioDevice {
                id: "simulated-default".into(),
                name: "Simulated Speakers".into(),
                is_default: true,
            }],
            failing_uris: std::collections::HashSet::new(),
        }
    }

    #[cfg(test)]
    pub fn fail_load_for_test(&mut self, uri: &str) {
        self.failing_uris.insert(uri.to_string());
    }

    #[cfg(test)]
    pub fn speed_for_test(&self, slot: Slot) -> f64 {
        self.slots.get(&slot).unwrap().speed
    }

    #[cfg(test)]
    pub fn push_error_for_test(&mut self, slot: Slot, message: &str) {
        self.slots
            .get_mut(&slot)
            .unwrap()
            .pending_events
            .push(BackendEvent::Error(message.to_string()));
    }

    /// Test-only hook: sets the fake duration a slot reports, so a test
    /// can then call `advance` up to it and observe EOS.
    #[cfg(test)]
    pub fn set_duration_for_test(&mut self, slot: Slot, duration_ms: u64) {
        self.slots.get_mut(&slot).unwrap().duration_ms = Some(duration_ms);
    }

    /// Test-only hook: advances a playing slot's simulated position by
    /// `ms`, emitting `AdvancedToGaplessNext` or `Eos` if it reaches the
    /// fake duration.
    #[cfg(test)]
    pub fn advance(&mut self, slot: Slot, ms: u64) {
        let state = self.slots.get_mut(&slot).unwrap();
        if !state.playing {
            return;
        }
        state.position_ms += ms;
        if let Some(duration) = state.duration_ms {
            if state.position_ms >= duration {
                state.position_ms = duration;
                state.playing = false;
                if let Some(next) = state.gapless_next.take() {
                    state.uri = Some(next);
                    state.position_ms = 0;
                    state.playing = true;
                    state
                        .pending_events
                        .push(BackendEvent::AdvancedToGaplessNext);
                } else {
                    state.pending_events.push(BackendEvent::Eos);
                }
            }
        }
    }
}

impl Default for SimulatedBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl Backend for SimulatedBackend {
    fn load(&mut self, slot: Slot, uri: &str) -> Result<()> {
        if self.failing_uris.contains(uri) {
            return Err(crate::error::Error::Pipeline(format!(
                "simulated load failure: {uri}"
            )));
        }
        let state = self.slots.get_mut(&slot).unwrap();
        state.uri = Some(uri.to_string());
        state.position_ms = 0;
        state.playing = false;
        Ok(())
    }

    fn play(&mut self, slot: Slot) -> Result<()> {
        self.slots.get_mut(&slot).unwrap().playing = true;
        Ok(())
    }

    fn pause(&mut self, slot: Slot) -> Result<()> {
        self.slots.get_mut(&slot).unwrap().playing = false;
        Ok(())
    }

    fn stop(&mut self, slot: Slot) -> Result<()> {
        *self.slots.get_mut(&slot).unwrap() = SlotState::new();
        Ok(())
    }

    fn seek(&mut self, slot: Slot, position_ms: u64) -> Result<()> {
        self.slots.get_mut(&slot).unwrap().position_ms = position_ms;
        Ok(())
    }

    fn set_volume(&mut self, slot: Slot, volume: f64) -> Result<()> {
        self.slots.get_mut(&slot).unwrap().volume = volume;
        Ok(())
    }

    fn set_muted(&mut self, slot: Slot, muted: bool) -> Result<()> {
        self.slots.get_mut(&slot).unwrap().muted = muted;
        Ok(())
    }

    fn set_playback_speed(&mut self, slot: Slot, rate: f64) -> Result<()> {
        self.slots.get_mut(&slot).unwrap().speed = rate;
        Ok(())
    }

    fn set_eq_band(&mut self, slot: Slot, band: usize, gain_db: f64) -> Result<()> {
        if band >= EQ_BAND_COUNT {
            return Err(crate::error::Error::Internal(format!(
                "EQ band {band} out of range (0-{})",
                EQ_BAND_COUNT - 1
            )));
        }
        self.slots.get_mut(&slot).unwrap().eq[band] = gain_db;
        Ok(())
    }

    fn set_gapless_next(&mut self, slot: Slot, uri: Option<&str>) -> Result<()> {
        self.slots.get_mut(&slot).unwrap().gapless_next = uri.map(str::to_string);
        Ok(())
    }

    fn set_output_device(&mut self, slot: Slot, device_id: Option<&str>) -> Result<()> {
        self.slots.get_mut(&slot).unwrap().device_id = device_id.map(str::to_string);
        Ok(())
    }

    fn position_ms(&self, slot: Slot) -> Option<u64> {
        self.slots
            .get(&slot)
            .and_then(|s| s.uri.as_ref().map(|_| s.position_ms))
    }

    fn duration_ms(&self, slot: Slot) -> Option<u64> {
        self.slots.get(&slot).and_then(|s| s.duration_ms)
    }

    fn list_output_devices(&self) -> Vec<AudioDevice> {
        self.devices.clone()
    }

    fn poll_events(&mut self, slot: Slot) -> Vec<BackendEvent> {
        std::mem::take(&mut self.slots.get_mut(&slot).unwrap().pending_events)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_play_pause_stop_round_trip() {
        let mut backend = SimulatedBackend::new();
        backend.load(Slot::A, "file:///track.flac").unwrap();
        assert_eq!(backend.position_ms(Slot::A), Some(0));

        backend.play(Slot::A).unwrap();
        backend.pause(Slot::A).unwrap();
        backend.stop(Slot::A).unwrap();
        assert_eq!(backend.position_ms(Slot::A), None);
    }

    #[test]
    fn eq_band_out_of_range_is_rejected() {
        let mut backend = SimulatedBackend::new();
        assert!(backend.set_eq_band(Slot::A, 10, 3.0).is_err());
        assert!(backend.set_eq_band(Slot::A, 9, 3.0).is_ok());
    }

    #[test]
    fn advancing_past_duration_emits_eos_when_no_gapless_next_queued() {
        let mut backend = SimulatedBackend::new();
        backend.load(Slot::A, "file:///a.flac").unwrap();
        backend.set_duration_for_test(Slot::A, 1000);
        backend.play(Slot::A).unwrap();

        backend.advance(Slot::A, 1500);

        assert_eq!(backend.poll_events(Slot::A), vec![BackendEvent::Eos]);
    }

    #[test]
    fn advancing_past_duration_switches_to_gapless_next_and_reports_it() {
        let mut backend = SimulatedBackend::new();
        backend.load(Slot::A, "file:///a.flac").unwrap();
        backend.set_duration_for_test(Slot::A, 1000);
        backend
            .set_gapless_next(Slot::A, Some("file:///b.flac"))
            .unwrap();
        backend.play(Slot::A).unwrap();

        backend.advance(Slot::A, 1500);

        assert_eq!(
            backend.poll_events(Slot::A),
            vec![BackendEvent::AdvancedToGaplessNext]
        );
        assert_eq!(backend.position_ms(Slot::A), Some(0));
    }

    #[test]
    fn poll_events_drains_and_does_not_repeat() {
        let mut backend = SimulatedBackend::new();
        backend.load(Slot::A, "file:///a.flac").unwrap();
        backend.set_duration_for_test(Slot::A, 100);
        backend.play(Slot::A).unwrap();
        backend.advance(Slot::A, 200);

        assert_eq!(backend.poll_events(Slot::A).len(), 1);
        assert!(backend.poll_events(Slot::A).is_empty());
    }

    #[test]
    fn slots_are_independent() {
        let mut backend = SimulatedBackend::new();
        backend.load(Slot::A, "file:///a.flac").unwrap();
        backend.play(Slot::A).unwrap();
        assert_eq!(backend.position_ms(Slot::B), None);
    }
}
