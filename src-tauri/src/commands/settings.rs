//! Generic key/JSON-value settings bridge over `player_core::Database`'s
//! settings table (spec §23) — Tauri commands can't be generic, so the
//! type-specific shape of a given setting is the frontend's concern; this
//! layer only moves opaque JSON values in and out.

use crate::error::AppResult;
use crate::state::AppState;
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub fn get_setting(state: State<AppState>, key: String) -> AppResult<Option<Value>> {
    let db = state.db.lock().unwrap();
    Ok(db.get_setting(&key)?)
}

#[tauri::command]
pub fn set_setting(state: State<AppState>, key: String, value: Value) -> AppResult<()> {
    let db = state.db.lock().unwrap();
    db.set_setting(&key, &value)?;
    Ok(())
}
