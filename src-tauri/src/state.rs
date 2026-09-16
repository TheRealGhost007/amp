//! Shared application state. Holding `Player`/`Database` behind `Mutex`
//! here — rather than any playback/persistence logic — is this layer's
//! entire job; see `commands/` for the thin pass-through wrappers.

use audio_engine::{GstreamerBackend, Player};
use linux_integration::mpris::MprisHandle;
use player_core::Database;
use std::sync::Mutex;

pub struct AppState {
    /// `None` when the audio backend failed to initialize (no GStreamer/
    /// PipeWire, no usable sink, ...) — the app still starts, and player
    /// commands return a clear `AUDIO_UNAVAILABLE` error rather than the
    /// whole process crashing (spec §27).
    pub player: Mutex<Option<Player<GstreamerBackend>>>,
    pub db: Mutex<Database>,
    /// `None` when the MPRIS D-Bus service failed to register (no session
    /// bus, name already taken, ...) — same graceful-degradation pattern
    /// as `player`; the app is still fully usable without it, just not
    /// controllable via `playerctl`/media keys.
    pub mpris: Option<MprisHandle>,
}

impl AppState {
    pub fn new(mpris: Option<MprisHandle>) -> Self {
        let db_path = Database::default_path().unwrap_or_else(|e| {
            tracing::error!("could not resolve database path, using a temp fallback: {e}");
            std::env::temp_dir().join("amp-fallback-library.sqlite3")
        });
        let db = Database::open(&db_path).unwrap_or_else(|e| {
            tracing::error!(
                "failed to open database at {db_path:?}, falling back to in-memory: {e}"
            );
            Database::open_in_memory().expect("in-memory database must always succeed")
        });

        let player = match GstreamerBackend::new() {
            Ok(backend) => Some(Player::new(backend)),
            Err(e) => {
                tracing::error!("audio backend failed to initialize, playback is unavailable: {e}");
                None
            }
        };

        Self {
            player: Mutex::new(player),
            db: Mutex::new(db),
            mpris,
        }
    }
}
