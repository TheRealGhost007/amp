//! Thin pass-throughs to `audio_engine::Player` — every one of these is a
//! lock, a single method call, and a return. Any actual playback logic
//! belongs in `audio-engine`, not here (see that crate's `player.rs`).

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use audio_engine::{AudioDevice, TrackRef};
use tauri::State;

fn unavailable() -> AppError {
    audio_engine::error::Error::Unavailable("audio backend did not initialize at startup".into())
        .into()
}

#[derive(serde::Serialize)]
pub struct PlayerStatus {
    current_track: Option<TrackRef>,
    is_playing: bool,
    position_ms: Option<u64>,
    duration_ms: Option<u64>,
}

#[tauri::command]
pub fn player_status(state: State<AppState>) -> AppResult<PlayerStatus> {
    let guard = state.player.lock().unwrap();
    let player = guard.as_ref().ok_or_else(unavailable)?;
    Ok(PlayerStatus {
        current_track: player.current_track().cloned(),
        is_playing: player.is_playing(),
        position_ms: player.position_ms(),
        duration_ms: player.duration_ms(),
    })
}

#[tauri::command]
pub fn player_play_now(state: State<AppState>, track: TrackRef) -> AppResult<()> {
    let mut guard = state.player.lock().unwrap();
    let player = guard.as_mut().ok_or_else(unavailable)?;
    player.play_now(track)?;
    Ok(())
}

#[tauri::command]
pub fn player_pause(state: State<AppState>) -> AppResult<()> {
    let mut guard = state.player.lock().unwrap();
    let player = guard.as_mut().ok_or_else(unavailable)?;
    player.pause()?;
    Ok(())
}

#[tauri::command]
pub fn player_resume(state: State<AppState>) -> AppResult<()> {
    let mut guard = state.player.lock().unwrap();
    let player = guard.as_mut().ok_or_else(unavailable)?;
    player.resume()?;
    Ok(())
}

#[tauri::command]
pub fn player_stop(state: State<AppState>) -> AppResult<()> {
    let mut guard = state.player.lock().unwrap();
    let player = guard.as_mut().ok_or_else(unavailable)?;
    player.stop()?;
    Ok(())
}

#[tauri::command]
pub fn player_seek(state: State<AppState>, position_ms: u64) -> AppResult<()> {
    let mut guard = state.player.lock().unwrap();
    let player = guard.as_mut().ok_or_else(unavailable)?;
    player.seek(position_ms)?;
    drop(guard);
    // Any seek — not just one MPRIS itself requested — should emit
    // MPRIS's `Seeked` signal, or an external client (a lock-screen
    // scrubber, another MPRIS-aware widget) watching this player would
    // silently desync from a seek made through the app's own UI.
    if let Some(mpris) = &state.mpris {
        mpris.notify_seeked(position_ms);
    }
    Ok(())
}

#[tauri::command]
pub fn player_set_next(state: State<AppState>, track: Option<TrackRef>) -> AppResult<()> {
    let mut guard = state.player.lock().unwrap();
    let player = guard.as_mut().ok_or_else(unavailable)?;
    player.set_next(track)?;
    Ok(())
}

#[tauri::command]
pub fn player_set_volume(state: State<AppState>, volume: f64) -> AppResult<()> {
    let mut guard = state.player.lock().unwrap();
    let player = guard.as_mut().ok_or_else(unavailable)?;
    player.set_volume(volume)?;
    Ok(())
}

#[tauri::command]
pub fn player_set_muted(state: State<AppState>, muted: bool) -> AppResult<()> {
    let mut guard = state.player.lock().unwrap();
    let player = guard.as_mut().ok_or_else(unavailable)?;
    player.set_muted(muted)?;
    Ok(())
}

#[tauri::command]
pub fn player_set_eq_band(state: State<AppState>, band: usize, gain_db: f64) -> AppResult<()> {
    let mut guard = state.player.lock().unwrap();
    let player = guard.as_mut().ok_or_else(unavailable)?;
    player.set_eq_band(band, gain_db)?;
    Ok(())
}

#[tauri::command]
pub fn player_set_playback_speed(state: State<AppState>, rate: f64) -> AppResult<()> {
    let mut guard = state.player.lock().unwrap();
    let player = guard.as_mut().ok_or_else(unavailable)?;
    player.set_playback_speed(rate)?;
    Ok(())
}

#[tauri::command]
pub fn player_set_crossfade_duration(
    state: State<AppState>,
    duration_ms: Option<u64>,
) -> AppResult<()> {
    let mut guard = state.player.lock().unwrap();
    let player = guard.as_mut().ok_or_else(unavailable)?;
    player.set_crossfade_duration(duration_ms)?;
    Ok(())
}

#[tauri::command]
pub fn player_list_devices(state: State<AppState>) -> AppResult<Vec<AudioDevice>> {
    let guard = state.player.lock().unwrap();
    let player = guard.as_ref().ok_or_else(unavailable)?;
    Ok(player.list_devices())
}

#[tauri::command]
pub fn player_set_device(state: State<AppState>, device_id: Option<String>) -> AppResult<()> {
    let mut guard = state.player.lock().unwrap();
    let player = guard.as_mut().ok_or_else(unavailable)?;
    player.set_device(device_id.as_deref())?;
    Ok(())
}
