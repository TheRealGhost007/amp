mod commands;
mod error;
mod state;

use state::AppState;
use std::time::Duration;
use tauri::{Emitter, Manager};

const TICK_INTERVAL_MS: u64 = 200;

/// Periodically drives `Player::tick` and forwards whatever it reports to
/// the frontend. Kept here (not in `audio-engine`) because "run on a
/// timer and talk to a window" is IPC-layer responsibility, not
/// playback logic — `Player` itself stays a plain, synchronously-driven
/// state machine that `cargo test` can call directly with no timer at
/// all (see its own doc comment).
fn spawn_player_tick_loop(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(TICK_INTERVAL_MS));
        loop {
            interval.tick().await;
            let state = app_handle.state::<AppState>();
            let events = {
                let mut guard = state.player.lock().unwrap();
                let Some(player) = guard.as_mut() else {
                    continue;
                };
                let events = player.tick(TICK_INTERVAL_MS);
                let position = serde_json::json!({
                    "position_ms": player.position_ms(),
                    "duration_ms": player.duration_ms(),
                });
                (events, position)
            };
            let (events, position) = events;

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
            app.manage(AppState::new());
            spawn_player_tick_loop(app.handle().clone());
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
            commands::favorites::favorites_is_favorite,
            commands::favorites::favorites_toggle,
            commands::favorites::favorites_list_ids,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
