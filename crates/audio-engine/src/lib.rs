//! GStreamer-backed playback engine: decode, gapless transitions, crossfade,
//! equalizer, playback speed, and PipeWire device enumeration/switching.
//!
//! This crate must never depend on `tauri` — `src-tauri` only forwards its
//! events and calls its state-machine API.

pub mod error;

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
