//! The `Backend` trait abstracts everything that actually touches
//! GStreamer/PipeWire, so `Player` (the crossfade/state-machine logic in
//! `player.rs`) can be exercised by `cargo test` against
//! [`simulated::SimulatedBackend`] without a display, audio device, or
//! even GStreamer itself installed — the plan's "simulated backend for
//! CI" requirement (mirroring rgb-control-center's pattern).

pub mod real;
pub mod simulated;

pub use real::GstreamerBackend;
pub use simulated::SimulatedBackend;

use crate::error::Result;
use crate::types::{AudioDevice, Slot};

/// One event a backend can report since the last `poll_events` call.
/// Deliberately narrower than `PlayerEvent` — `Player` translates these
/// into the public event type, adding crossfade-awareness the backend
/// itself doesn't need to know about.
#[derive(Debug, Clone, PartialEq)]
pub enum BackendEvent {
    /// The slot reached its end and, because a gapless next URI was
    /// armed via `set_gapless_next`, switched straight to it with no
    /// gap — `Player` needs this to know *when* to swap its own notion
    /// of "current track" to `next`; `Eos` is never also reported for
    /// the same transition.
    AdvancedToGaplessNext,
    Eos,
    Error(String),
}

/// A single playback slot's primitive operations. `Player` calls these
/// on `Slot::A`/`Slot::B` directly; all crossfade/gapless timing logic
/// lives above this trait, not inside any implementation of it.
pub trait Backend: Send {
    fn load(&mut self, slot: Slot, uri: &str) -> Result<()>;
    fn play(&mut self, slot: Slot) -> Result<()>;
    fn pause(&mut self, slot: Slot) -> Result<()>;
    /// Returns the slot to the idle/`Null` state and releases its pipeline
    /// resources — called on the losing side of a completed crossfade.
    fn stop(&mut self, slot: Slot) -> Result<()>;
    fn seek(&mut self, slot: Slot, position_ms: u64) -> Result<()>;
    /// Linear volume, 0.0-1.0. Crossfade ramps call this frequently
    /// (every `tick()`), so implementations must be cheap.
    fn set_volume(&mut self, slot: Slot, volume: f64) -> Result<()>;
    fn set_muted(&mut self, slot: Slot, muted: bool) -> Result<()>;
    /// 1.0 = normal speed. Implementations should preserve pitch where
    /// the backend supports it (spec §12).
    fn set_playback_speed(&mut self, slot: Slot, rate: f64) -> Result<()>;
    /// `band` is 0-9 (10 bands, spec §12), `gain_db` roughly -12..+12.
    fn set_eq_band(&mut self, slot: Slot, band: usize, gain_db: f64) -> Result<()>;
    /// Arms gapless: when `slot` naturally reaches its end, the backend
    /// switches straight to `uri` with no silence in between. `None`
    /// disarms it (natural EOS is reported normally instead).
    fn set_gapless_next(&mut self, slot: Slot, uri: Option<&str>) -> Result<()>;
    /// `None` means "system default output."
    fn set_output_device(&mut self, slot: Slot, device_id: Option<&str>) -> Result<()>;
    fn position_ms(&self, slot: Slot) -> Option<u64>;
    fn duration_ms(&self, slot: Slot) -> Option<u64>;
    fn list_output_devices(&self) -> Vec<AudioDevice>;
    /// Drains and returns every event `slot` has produced since the last
    /// call. Never blocks.
    fn poll_events(&mut self, slot: Slot) -> Vec<BackendEvent>;
}
