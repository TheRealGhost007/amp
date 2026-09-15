//! Library database, scanning, metadata, search, playlists, favorites,
//! playback history and settings.
//!
//! This crate must never depend on `tauri` or the audio backend — it is
//! exercised by `cargo test` alone, without a display or audio device.

pub mod db;
pub mod error;
pub mod scan;

pub use db::Database;
pub use scan::{scan_root, ScanFileError, ScanSummary};

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
