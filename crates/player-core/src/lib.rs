//! Library database, scanning, metadata, search, playlists, favorites,
//! playback history and settings.
//!
//! This crate must never depend on `tauri` or the audio backend — it is
//! exercised by `cargo test` alone, without a display or audio device.

pub mod db;
pub mod error;
pub mod images;
pub mod metadata_editor;
pub mod scan;

pub use db::Database;
pub use metadata_editor::{update_track_metadata, ArtworkUpdate, MetadataUpdate};
pub use scan::{
    remove_cached_artwork, remove_scan_root_and_its_tracks, scan_root, track_artwork_path,
    ScanFileError, ScanSummary,
};

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
