mod error;

use error::AppResult;
use serde::Serialize;

/// Proves the workspace boundary at commit 1: this command only reads
/// version strings from the engine crates, it does not implement anything.
#[derive(Serialize)]
struct EngineVersions {
    player_core: &'static str,
    audio_engine: &'static str,
    linux_integration: &'static str,
}

#[tauri::command]
fn engine_versions() -> AppResult<EngineVersions> {
    Ok(EngineVersions {
        player_core: player_core::version(),
        audio_engine: audio_engine::version(),
        linux_integration: linux_integration::version(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![engine_versions])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
