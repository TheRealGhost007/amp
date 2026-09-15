//! Favorites — thin pass-throughs to `player_core::Database`'s
//! favorites table (built in Phase 2, unused by any UI until now).

use crate::error::AppResult;
use crate::state::AppState;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[tauri::command]
pub fn favorites_is_favorite(state: State<AppState>, track_id: i64) -> AppResult<bool> {
    let db = state.db.lock().unwrap();
    Ok(db.is_favorite(track_id)?)
}

/// Flips favorite status for `track_id` and returns the new state, so
/// the caller doesn't need a separate round-trip to re-check it.
#[tauri::command]
pub fn favorites_toggle(state: State<AppState>, track_id: i64) -> AppResult<bool> {
    let db = state.db.lock().unwrap();
    let currently_favorite = db.is_favorite(track_id)?;
    if currently_favorite {
        db.remove_favorite(track_id)?;
    } else {
        db.add_favorite(track_id, now())?;
    }
    Ok(!currently_favorite)
}

#[tauri::command]
pub fn favorites_list_ids(state: State<AppState>) -> AppResult<Vec<i64>> {
    let db = state.db.lock().unwrap();
    Ok(db.list_favorite_track_ids()?)
}
