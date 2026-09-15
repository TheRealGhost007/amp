//! GStreamer-backed playback engine: decode, gapless transitions, crossfade,
//! equalizer, playback speed, and PipeWire device enumeration/switching.
//!
//! This crate must never depend on `tauri` — `src-tauri` only forwards its
//! events and calls its state-machine API.

pub mod backend;
pub mod error;
pub mod player;
pub mod types;

pub use backend::{Backend, GstreamerBackend, SimulatedBackend};
pub use player::Player;
pub use types::{AudioDevice, PlaybackState, PlayerEvent, Slot, TrackRef};

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_set() {
        assert!(!version().is_empty());
    }
}
