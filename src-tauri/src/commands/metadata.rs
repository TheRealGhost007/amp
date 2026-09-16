//! Metadata editing — thin pass-through to `player_core::update_track_metadata`,
//! translating the frontend's plain-data artwork input into the
//! bytes-carrying `player_core::ArtworkUpdate` the write path needs.

use crate::error::AppResult;
use crate::state::AppState;
use player_core::db::models::TrackListItem;
use player_core::{ArtworkUpdate, Database, MetadataUpdate};
use serde::Deserialize;
use tauri::State;

/// The frontend never sends raw image bytes over IPC for a "replace"
/// update — just the path to the image file the user picked via the
/// native file dialog, which this command reads from disk itself.
#[derive(Deserialize)]
#[serde(tag = "type")]
pub enum ArtworkUpdateInput {
    Unchanged,
    Remove,
    Replace { path: String },
}

impl ArtworkUpdateInput {
    fn into_artwork_update(self) -> AppResult<ArtworkUpdate> {
        Ok(match self {
            ArtworkUpdateInput::Unchanged => ArtworkUpdate::Unchanged,
            ArtworkUpdateInput::Remove => ArtworkUpdate::Remove,
            ArtworkUpdateInput::Replace { path } => {
                let data = std::fs::read(&path)
                    .map_err(|e| player_core::error::Error::Internal(e.to_string()))?;
                let extension = std::path::Path::new(&path)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("jpg")
                    .to_string();
                ArtworkUpdate::Replace { data, extension }
            }
        })
    }
}

#[derive(Deserialize)]
pub struct MetadataUpdateInput {
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub genre: Option<String>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<i32>,
    pub artwork: ArtworkUpdateInput,
}

#[tauri::command]
pub fn metadata_update_track(
    state: State<AppState>,
    track_id: i64,
    update: MetadataUpdateInput,
) -> AppResult<TrackListItem> {
    let db = state.db.lock().unwrap();
    let cache_dir = Database::default_cache_dir()?;
    let update = MetadataUpdate {
        title: update.title,
        artist: update.artist,
        album: update.album,
        album_artist: update.album_artist,
        genre: update.genre,
        track_number: update.track_number,
        disc_number: update.disc_number,
        year: update.year,
        artwork: update.artwork.into_artwork_update()?,
    };
    Ok(player_core::update_track_metadata(
        &db, &cache_dir, track_id, &update,
    )?)
}
