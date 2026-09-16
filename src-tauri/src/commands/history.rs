//! Playback history — thin pass-throughs to `player_core::Database`'s
//! playback_history table (built in Phase 2, unused by any UI until now).

use crate::error::AppResult;
use crate::state::AppState;
use player_core::db::models::TrackListItem;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[tauri::command]
pub fn history_record_played(state: State<AppState>, track_id: i64) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    db.record_played(track_id, now())?;
    Ok(())
}

#[tauri::command]
pub fn history_list_recent(state: State<AppState>) -> AppResult<Vec<TrackListItem>> {
    let db = state.db.lock().unwrap();
    Ok(db.list_recently_played_for_browse(50)?)
}
