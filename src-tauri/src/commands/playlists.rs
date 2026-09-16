//! Playlist commands — thin pass-throughs to `player_core::Database`'s
//! playlist tables.

use crate::error::AppResult;
use crate::state::AppState;
use player_core::db::models::{Playlist, PlaylistSummary, PlaylistTrackItem};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[tauri::command]
pub fn playlists_list(state: State<AppState>) -> AppResult<Vec<PlaylistSummary>> {
    let db = state.db.lock().unwrap();
    Ok(db.list_playlists_for_browse()?)
}

#[tauri::command]
pub fn playlists_create(state: State<AppState>, name: String) -> AppResult<Playlist> {
    let db = state.db.lock().unwrap();
    Ok(db.create_playlist(&name, now())?)
}

#[tauri::command]
pub fn playlists_rename(state: State<AppState>, playlist_id: i64, name: String) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    db.rename_playlist(playlist_id, &name, now())?;
    Ok(())
}

#[tauri::command]
pub fn playlists_set_description(
    state: State<AppState>,
    playlist_id: i64,
    description: Option<String>,
) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    db.set_playlist_description(playlist_id, description.as_deref(), now())?;
    Ok(())
}

#[tauri::command]
pub fn playlists_delete(state: State<AppState>, playlist_id: i64) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    db.delete_playlist(playlist_id)?;
    Ok(())
}

#[tauri::command]
pub fn playlists_list_tracks(
    state: State<AppState>,
    playlist_id: i64,
) -> AppResult<Vec<PlaylistTrackItem>> {
    let db = state.db.lock().unwrap();
    Ok(db.list_playlist_tracks_for_browse(playlist_id)?)
}

/// Adds a track to a playlist, returning the new `playlist_tracks` row's
/// own id.
#[tauri::command]
pub fn playlists_add_track(
    state: State<AppState>,
    playlist_id: i64,
    track_id: i64,
) -> AppResult<i64> {
    let db = state.db.lock().unwrap();
    Ok(db.add_track_to_playlist(playlist_id, track_id)?)
}

#[tauri::command]
pub fn playlists_remove_track(state: State<AppState>, playlist_track_id: i64) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    db.remove_playlist_track(playlist_track_id)?;
    Ok(())
}

#[tauri::command]
pub fn playlists_reorder_tracks(
    state: State<AppState>,
    playlist_id: i64,
    playlist_track_ids: Vec<i64>,
) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    db.reorder_playlist(playlist_id, &playlist_track_ids)?;
    Ok(())
}
