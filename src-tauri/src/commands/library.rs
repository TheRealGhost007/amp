//! Library browsing + scanning commands — thin pass-throughs to
//! `player_core::Database`'s browse queries and `player_core::scan`.
//! Scanning runs on a blocking thread (spec §19: never block the UI
//! thread) since walking a large folder tree and hashing files is
//! genuinely slow; the browse queries are simple indexed reads and stay
//! synchronous.

use crate::error::AppResult;
use crate::state::AppState;
use player_core::db::models::{AlbumSummary, ArtistSummary, TrackListItem};
use player_core::{scan_root, Database, ScanSummary};
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn library_add_folder(app: AppHandle, path: String) -> AppResult<ScanSummary> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let db = state.db.lock().unwrap();
        let cache_dir = Database::default_cache_dir()?;
        Ok(scan_root(&db, &cache_dir, std::path::Path::new(&path))?)
    })
    .await
    .unwrap_or_else(|e| {
        Err(player_core::error::Error::Internal(format!("scan task panicked: {e}")).into())
    })
}

#[tauri::command]
pub fn library_list_scan_roots(state: State<AppState>) -> AppResult<Vec<String>> {
    let db = state.db.lock().unwrap();
    Ok(db.list_scan_roots()?)
}

#[tauri::command]
pub fn library_remove_scan_root(state: State<AppState>, path: String) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    db.remove_scan_root(&path)?;
    Ok(())
}

#[tauri::command]
pub fn library_list_tracks(state: State<AppState>) -> AppResult<Vec<TrackListItem>> {
    let db = state.db.lock().unwrap();
    Ok(db.list_tracks_for_browse()?)
}

#[tauri::command]
pub fn library_list_albums(state: State<AppState>) -> AppResult<Vec<AlbumSummary>> {
    let db = state.db.lock().unwrap();
    Ok(db.list_albums_for_browse()?)
}

#[tauri::command]
pub fn library_list_artists(state: State<AppState>) -> AppResult<Vec<ArtistSummary>> {
    let db = state.db.lock().unwrap();
    Ok(db.list_artists_for_browse()?)
}

#[tauri::command]
pub fn library_search(state: State<AppState>, query: String) -> AppResult<Vec<TrackListItem>> {
    let db = state.db.lock().unwrap();
    Ok(db.search_tracks_for_browse(&query, 50)?)
}

/// Permanently removes one track from the library (context menu's
/// "Remove From Library") — distinct from a scan picking up that the
/// file is simply gone; this also drops it from the search index so a
/// stale entry can't outlive the row it points to.
#[tauri::command]
pub fn library_remove_track(state: State<AppState>, track_id: i64) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    db.remove_track_from_search_index(track_id)?;
    db.delete_track(track_id)?;
    Ok(())
}
