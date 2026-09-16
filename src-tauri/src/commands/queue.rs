//! Queue commands — thin pass-throughs to `player_core::Database`'s
//! queue table. Orchestrating the queue against actual playback (syncing
//! its head to `audio_engine::Player::set_next`, popping the head when a
//! track naturally advances) is the frontend's job, not this layer's —
//! these commands only ever touch the persisted queue itself.

use crate::error::AppResult;
use crate::state::AppState;
use player_core::db::models::QueueTrackItem;
use tauri::State;

#[tauri::command]
pub fn queue_list(state: State<AppState>) -> AppResult<Vec<QueueTrackItem>> {
    let db = state.db.lock().unwrap();
    Ok(db.list_queue_for_browse()?)
}

/// Appends to the end of the queue, returning the new row's own id.
#[tauri::command]
pub fn queue_add(state: State<AppState>, track_id: i64) -> AppResult<i64> {
    let db = state.db.lock().unwrap();
    Ok(db.add_to_queue(track_id)?)
}

/// Inserts at the front of the queue ("Play Next"), returning the new
/// row's own id.
#[tauri::command]
pub fn queue_play_next(state: State<AppState>, track_id: i64) -> AppResult<i64> {
    let db = state.db.lock().unwrap();
    Ok(db.insert_next_in_queue(track_id)?)
}

#[tauri::command]
pub fn queue_remove(state: State<AppState>, queue_item_id: i64) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    db.remove_queue_item(queue_item_id)?;
    Ok(())
}

#[tauri::command]
pub fn queue_reorder(state: State<AppState>, queue_item_ids: Vec<i64>) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    db.reorder_queue(&queue_item_ids)?;
    Ok(())
}

#[tauri::command]
pub fn queue_clear(state: State<AppState>) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    db.clear_queue()?;
    Ok(())
}
