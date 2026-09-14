//! MPRIS, desktop notifications, and media-key capture for the Linux
//! desktop shell (Omarchy/Hyprland-first, generic freedesktop-compatible).
//!
//! This crate must never depend on `tauri` — it consumes `player-core` and
//! `audio-engine` state directly so it can be exercised without a window.

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
