mod commands;
mod error;
mod mpris;
mod state;

use audio_engine::PlaybackState;
use linux_integration::mpris::PlayerCommand;
use mpris::NowPlayingTracker;
use player_core::Database;
use state::AppState;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc::UnboundedReceiver;

const TICK_INTERVAL_MS: u64 = 200;
/// `org.mpris.MediaPlayer2.amp` — see `linux_integration::mpris::spawn`'s
/// doc comment for how this becomes a full bus name.
const MPRIS_BUS_NAME_SUFFIX: &str = "amp";
const MPRIS_IDENTITY: &str = "Amp";

fn playback_state_for(is_playing: bool, has_track: bool) -> PlaybackState {
    if !has_track {
        PlaybackState::Stopped
    } else if is_playing {
        PlaybackState::Playing
    } else {
        PlaybackState::Paused
    }
}

fn notifications_enabled(db: &Database) -> bool {
    db.get_setting::<bool>(mpris::NOTIFICATIONS_SETTING_KEY)
        .ok()
        .flatten()
        .unwrap_or(true)
}

/// Periodically drives `Player::tick` and forwards whatever it reports to
/// the frontend. Kept here (not in `audio-engine`) because "run on a
/// timer and talk to a window" is IPC-layer responsibility, not
/// playback logic — `Player` itself stays a plain, synchronously-driven
/// state machine that `cargo test` can call directly with no timer at
/// all (see its own doc comment).
///
/// Also the single choke point that notices a track change (comparing
/// this tick's current track against the last one) and pushes an
/// updated MPRIS snapshot / fires a track-change notification exactly
/// once per change, regardless of which command caused it (explicit
/// play, gapless advance, crossfade, or an MPRIS `Next`/`Previous`
/// itself) — cheaper and more correct than hooking every individual
/// command handler that could change the current track.
fn spawn_player_tick_loop(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(TICK_INTERVAL_MS));
        let mut now_playing = NowPlayingTracker::new();
        loop {
            interval.tick().await;
            let state = app_handle.state::<AppState>();
            let (events, position, snapshot, notify) = {
                let mut guard = state.player.lock().unwrap();
                let Some(player) = guard.as_mut() else {
                    continue;
                };
                let events = player.tick(TICK_INTERVAL_MS);
                let position_ms = player.position_ms();
                let duration_ms = player.duration_ms();
                let position = serde_json::json!({
                    "position_ms": position_ms,
                    "duration_ms": duration_ms,
                });

                let track_id = player.current_track().map(|t| t.id);
                let (snapshot, notify) = if state.mpris.is_some() {
                    let db = state.db.lock().unwrap();
                    let cache_dir = Database::default_cache_dir().unwrap_or_default();
                    let is_new_track = now_playing.refresh_if_changed(&db, &cache_dir, track_id);
                    let playback_state =
                        playback_state_for(player.is_playing(), track_id.is_some());
                    let snapshot = now_playing.snapshot(
                        position_ms.unwrap_or(0),
                        duration_ms,
                        playback_state,
                        player.volume(),
                    );
                    let notify = is_new_track && notifications_enabled(&db);
                    (Some(snapshot), notify)
                } else {
                    (None, false)
                };

                (events, position, snapshot, notify)
            };

            if let Some(snapshot) = snapshot {
                if let Some(mpris) = &state.mpris {
                    mpris.update(snapshot);
                }
            }
            if notify {
                if let Some(info) = now_playing.notification() {
                    if let Err(e) =
                        linux_integration::notifications::notify_track_change(info).await
                    {
                        tracing::warn!("failed to show track-change notification: {e}");
                    }
                }
            }

            if let Err(e) = app_handle.emit("player-position", position) {
                tracing::warn!("failed to emit player-position: {e}");
            }
            match events {
                Ok(events) => {
                    for event in events {
                        if let Err(e) = app_handle.emit("player-event", &event) {
                            tracing::warn!("failed to emit player-event: {e}");
                        }
                    }
                }
                Err(e) => tracing::warn!("player tick failed: {e}"),
            }
        }
    });
}

/// Emits the same `player-event`s the tick loop does, so a state change
/// initiated from outside the frontend (an MPRIS `Play`/`Pause`/`Stop`)
/// is reflected in the app's own UI immediately instead of waiting up to
/// one tick — matches Phase 7's "Zustand store is the only source of
/// truth" invariant regardless of what triggered the change.
fn emit_player_events(app_handle: &AppHandle, events: Vec<audio_engine::PlayerEvent>) {
    for event in events {
        if let Err(e) = app_handle.emit("player-event", &event) {
            tracing::warn!("failed to emit player-event: {e}");
        }
    }
}

/// Drains MPRIS control requests (`playerctl`, media keys via Omarchy's
/// Quickshell media widget, a lock-screen scrubber, ...) and applies
/// them. `Next`/`Previous` are forwarded to the frontend as an event
/// rather than acted on here, since the actual queue/play-history the
/// frontend's own transport buttons use lives in its Zustand stores, not
/// in `audio_engine::Player` — nothing on the Rust side has that state.
fn spawn_mpris_command_loop(
    app_handle: tauri::AppHandle,
    mut commands: UnboundedReceiver<PlayerCommand>,
) {
    tauri::async_runtime::spawn(async move {
        while let Some(command) = commands.recv().await {
            let state = app_handle.state::<AppState>();
            match command {
                PlayerCommand::Next => {
                    let _ = app_handle.emit("mpris-transport", "Next");
                }
                PlayerCommand::Previous => {
                    let _ = app_handle.emit("mpris-transport", "Previous");
                }
                PlayerCommand::Play
                | PlayerCommand::Pause
                | PlayerCommand::PlayPause
                | PlayerCommand::Stop => {
                    let mut guard = state.player.lock().unwrap();
                    let Some(player) = guard.as_mut() else {
                        continue;
                    };
                    let result = match command {
                        PlayerCommand::Play => player.resume(),
                        PlayerCommand::Pause => player.pause(),
                        PlayerCommand::PlayPause => {
                            if player.is_playing() {
                                player.pause()
                            } else {
                                player.resume()
                            }
                        }
                        PlayerCommand::Stop => player.stop(),
                        _ => unreachable!(),
                    };
                    drop(guard);
                    match result {
                        Ok(events) => emit_player_events(&app_handle, events),
                        Err(e) => tracing::warn!("MPRIS transport command failed: {e}"),
                    }
                }
                PlayerCommand::SeekBy(offset_ms) => {
                    let mut guard = state.player.lock().unwrap();
                    let Some(player) = guard.as_mut() else {
                        continue;
                    };
                    let target = linux_integration::mpris::apply_seek_offset(
                        player.position_ms().unwrap_or(0),
                        player.duration_ms(),
                        offset_ms,
                    );
                    if let Err(e) = player.seek(target) {
                        tracing::warn!("MPRIS seek failed: {e}");
                        continue;
                    }
                    drop(guard);
                    if let Some(mpris) = &state.mpris {
                        mpris.notify_seeked(target);
                    }
                }
                PlayerCommand::SetPosition {
                    track_id,
                    position_ms,
                } => {
                    let mut guard = state.player.lock().unwrap();
                    let Some(player) = guard.as_mut() else {
                        continue;
                    };
                    // A stale `SetPosition` for a track that isn't
                    // playing anymore must be ignored, per the MPRIS
                    // spec — otherwise a slow client could seek whatever
                    // happens to be playing by the time its request
                    // arrives.
                    if player.current_track().map(|t| t.id) != Some(track_id) {
                        continue;
                    }
                    if let Err(e) = player.seek(position_ms) {
                        tracing::warn!("MPRIS set-position failed: {e}");
                        continue;
                    }
                    drop(guard);
                    if let Some(mpris) = &state.mpris {
                        mpris.notify_seeked(position_ms);
                    }
                }
                PlayerCommand::SetVolume(volume) => {
                    let mut guard = state.player.lock().unwrap();
                    let Some(player) = guard.as_mut() else {
                        continue;
                    };
                    if let Err(e) = player.set_volume(volume) {
                        tracing::warn!("MPRIS set-volume failed: {e}");
                    }
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    // WebKitGTK's DMA-BUF renderer crashes with "Error 71 (Protocol error)
    // dispatching to Wayland display" on the NVIDIA proprietary driver
    // under Wayland — see ARCHITECTURE.md's "Known tradeoff" section.
    // (Set in main.rs, before GTK/WebKit initialize; noted here too since
    // it's load-bearing for `run()` actually reaching a window.)

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let (mpris, mpris_commands) = match tauri::async_runtime::block_on(
                linux_integration::mpris::spawn(MPRIS_BUS_NAME_SUFFIX, MPRIS_IDENTITY),
            ) {
                Ok((handle, commands)) => (Some(handle), Some(commands)),
                Err(e) => {
                    tracing::error!(
                        "MPRIS service failed to start, playerctl/media keys won't work: {e}"
                    );
                    (None, None)
                }
            };
            app.manage(AppState::new(mpris));
            spawn_player_tick_loop(app.handle().clone());
            if let Some(commands) = mpris_commands {
                spawn_mpris_command_loop(app.handle().clone(), commands);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::player::player_status,
            commands::player::player_play_now,
            commands::player::player_pause,
            commands::player::player_resume,
            commands::player::player_stop,
            commands::player::player_seek,
            commands::player::player_set_next,
            commands::player::player_set_volume,
            commands::player::player_set_muted,
            commands::player::player_set_eq_band,
            commands::player::player_set_playback_speed,
            commands::player::player_set_crossfade_duration,
            commands::player::player_list_devices,
            commands::player::player_set_device,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::library::library_add_folder,
            commands::library::library_list_scan_roots,
            commands::library::library_remove_scan_root,
            commands::library::library_list_tracks,
            commands::library::library_list_albums,
            commands::library::library_list_artists,
            commands::library::library_search,
            commands::library::library_remove_track,
            commands::history::history_record_played,
            commands::history::history_list_recent,
            commands::metadata::metadata_update_track,
            commands::favorites::favorites_is_favorite,
            commands::favorites::favorites_toggle,
            commands::favorites::favorites_list_ids,
            commands::queue::queue_list,
            commands::queue::queue_add,
            commands::queue::queue_play_next,
            commands::queue::queue_remove,
            commands::queue::queue_reorder,
            commands::queue::queue_clear,
            commands::playlists::playlists_list,
            commands::playlists::playlists_create,
            commands::playlists::playlists_rename,
            commands::playlists::playlists_set_description,
            commands::playlists::playlists_delete,
            commands::playlists::playlists_list_tracks,
            commands::playlists::playlists_add_track,
            commands::playlists::playlists_remove_track,
            commands::playlists::playlists_reorder_tracks,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
