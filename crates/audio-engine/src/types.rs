//! Types shared between `Player` and every `Backend` implementation.

use serde::{Deserialize, Serialize};

/// Deliberately independent of `player-core`'s `Track` model — this
/// crate only needs a URI and an id to report back in events, keeping
/// the audio and library concerns decoupled. `Deserialize` is needed
/// alongside `Serialize` here (unlike most other types in this crate)
/// because `src-tauri` commands accept a `TrackRef` as an argument from
/// the frontend (e.g. "play this track"), not just report one back.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TrackRef {
    pub id: i64,
    pub uri: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum PlaybackState {
    Stopped,
    Playing,
    Paused,
    /// Loaded but waiting on the pipeline to preroll (network buffering,
    /// initial seek settling).
    Buffering,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum PlayerEvent {
    StateChanged(PlaybackState),
    /// The track that was queued via `Player::set_next` is now playing —
    /// fired for both a gapless swap and a completed crossfade, so the
    /// caller can advance its queue/now-playing UI/history exactly once
    /// per transition regardless of which mechanism handled it.
    TrackAdvanced,
    /// Fired once, when the active track naturally finishes (EOS) with no
    /// queued next track to crossfade/gapless into — the caller (Phase 6+
    /// queue logic) decides what happens next.
    PlaybackFinished,
    /// A backend-level error (decode failure, missing codec, device gone)
    /// that isn't fatal to the process — surfaced for the UI/log, spec §27.
    Error(String),
    OutputDevicesChanged(Vec<AudioDevice>),
}

/// Two independent playback slots. Normal playback and gapless use only
/// `A`; a crossfade transition briefly runs both simultaneously (spec
/// §12) — see `player.rs` for the transition state machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Slot {
    A,
    B,
}

impl Slot {
    pub fn other(self) -> Slot {
        match self {
            Slot::A => Slot::B,
            Slot::B => Slot::A,
        }
    }
}

/// The number of bands `Player::set_eq_band` accepts (spec §12: 10-band
/// equalizer).
pub const EQ_BAND_COUNT: usize = 10;
