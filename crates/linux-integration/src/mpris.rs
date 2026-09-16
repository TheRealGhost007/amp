//! MPRIS (`org.mpris.MediaPlayer2`) service, backed by `mpris-server`'s
//! `Send`-safe [`RootInterface`]/[`PlayerInterface`] traits and
//! [`Server`], run on the caller's existing async runtime (`src-tauri`'s
//! own `tauri::async_runtime`) rather than a dedicated thread.
//!
//! An earlier version of this module used `mpris-server`'s `!Send`,
//! `Rc`-based `Player` convenience type instead, which requires its own
//! dedicated OS thread running a single-threaded Tokio `LocalSet` (it
//! can't share a multi-threaded runtime). That worked in isolation but
//! broke silently, without any error, once a real GStreamer pipeline in
//! the same process reached the `Playing` state: internal reads on the
//! MPRIS thread confirmed properties were set correctly, but external
//! D-Bus queries (`busctl get-property`, `playerctl`) kept reading the
//! stale initial values indefinitely — root-caused via a series of
//! minimal reproductions (see ARCHITECTURE.md's Phase 11 section) that
//! isolated the trigger to "a `playbin3`/`pipewiresink` pipeline
//! actually streaming audio in the same process," not just GStreamer
//! initialization or a loaded-but-paused pipeline. The `Send`-safe
//! `Server` approach needs no dedicated thread or manual polling loop at
//! all (zbus drives it via its own connection-owned executor task, the
//! same way any other zbus interface works) and doesn't exhibit the
//! problem — it wasn't just worked around, the whole failure-prone
//! mechanism (a separate, manually-polled runtime) is gone.
//!
//! The one thing this crate still needs that `player-core`/`audio-engine`
//! don't provide for free is a live D-Bus session, which isn't
//! guaranteed in CI, so the actual service is verified on-device (see
//! ARCHITECTURE.md) while the pure logic below (status mapping, seek
//! math, track-id encoding) is unit-tested.

use crate::error::{Error, Result};
use audio_engine::PlaybackState;
use mpris_server::zbus::fdo;
use mpris_server::{
    LoopStatus, Metadata, PlaybackRate, PlaybackStatus, PlayerInterface, RootInterface, Server,
    Signal, Time, TrackId, Volume,
};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};

const TRACK_ID_PREFIX: &str = "/com/omarchyplayer/Amp/Track/";

/// Plain, `Send` snapshot of everything MPRIS needs to display —
/// assembled by the caller from `audio_engine::Player` + a DB lookup,
/// since this crate has no access to either.
#[derive(Debug, Clone, PartialEq)]
pub struct PlayerSnapshot {
    pub track_id: Option<i64>,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub art_path: Option<PathBuf>,
    pub duration_ms: Option<u64>,
    pub position_ms: u64,
    pub state: PlaybackState,
    pub volume: f64,
}

/// A control request from an MPRIS client (a media-key daemon, a
/// lock-screen widget, `playerctl`, ...). `Next`/`Previous` are handed
/// back to the caller rather than acted on here because the actual
/// "what's next" queue and play-history live in the frontend's Zustand
/// stores, not in `audio_engine::Player` — this crate has no access to
/// either, by design (see `player-core`/`audio-engine`'s "zero Tauri
/// awareness" boundary; the queue is frontend-only, not even in Rust).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PlayerCommand {
    Play,
    Pause,
    PlayPause,
    Stop,
    Next,
    Previous,
    /// Relative offset in milliseconds (may be negative), per the MPRIS
    /// `Seek` method.
    SeekBy(i64),
    /// Absolute position, only applied if `track_id` still matches the
    /// currently-playing track (MPRIS `SetPosition`: a stale call
    /// targeting a track that's no longer current must be ignored).
    SetPosition {
        track_id: i64,
        position_ms: u64,
    },
    SetVolume(f64),
}

struct SharedState {
    metadata: Metadata,
    playback_status: PlaybackStatus,
    volume: f64,
    position_ms: u64,
    can_go_next: bool,
    can_go_previous: bool,
}

struct MprisImpl {
    identity: String,
    state: Mutex<SharedState>,
    command_tx: UnboundedSender<PlayerCommand>,
}

impl RootInterface for MprisImpl {
    async fn raise(&self) -> fdo::Result<()> {
        Ok(())
    }
    async fn quit(&self) -> fdo::Result<()> {
        Ok(())
    }
    async fn can_quit(&self) -> fdo::Result<bool> {
        Ok(false)
    }
    async fn fullscreen(&self) -> fdo::Result<bool> {
        Ok(false)
    }
    async fn set_fullscreen(&self, _fullscreen: bool) -> mpris_server::zbus::Result<()> {
        Ok(())
    }
    async fn can_set_fullscreen(&self) -> fdo::Result<bool> {
        Ok(false)
    }
    async fn can_raise(&self) -> fdo::Result<bool> {
        Ok(false)
    }
    async fn has_track_list(&self) -> fdo::Result<bool> {
        Ok(false)
    }
    async fn identity(&self) -> fdo::Result<String> {
        Ok(self.identity.clone())
    }
    async fn desktop_entry(&self) -> fdo::Result<String> {
        Ok("omarchy-player".to_string())
    }
    async fn supported_uri_schemes(&self) -> fdo::Result<Vec<String>> {
        Ok(vec!["file".to_string()])
    }
    async fn supported_mime_types(&self) -> fdo::Result<Vec<String>> {
        Ok(vec![])
    }
}

impl PlayerInterface for MprisImpl {
    async fn next(&self) -> fdo::Result<()> {
        let _ = self.command_tx.send(PlayerCommand::Next);
        Ok(())
    }
    async fn previous(&self) -> fdo::Result<()> {
        let _ = self.command_tx.send(PlayerCommand::Previous);
        Ok(())
    }
    async fn pause(&self) -> fdo::Result<()> {
        let _ = self.command_tx.send(PlayerCommand::Pause);
        Ok(())
    }
    async fn play_pause(&self) -> fdo::Result<()> {
        let _ = self.command_tx.send(PlayerCommand::PlayPause);
        Ok(())
    }
    async fn stop(&self) -> fdo::Result<()> {
        let _ = self.command_tx.send(PlayerCommand::Stop);
        Ok(())
    }
    async fn play(&self) -> fdo::Result<()> {
        let _ = self.command_tx.send(PlayerCommand::Play);
        Ok(())
    }
    async fn seek(&self, offset: Time) -> fdo::Result<()> {
        let _ = self
            .command_tx
            .send(PlayerCommand::SeekBy(offset.as_millis()));
        Ok(())
    }
    async fn set_position(&self, track_id: TrackId, position: Time) -> fdo::Result<()> {
        if let Some(id) = parse_track_id(&track_id) {
            let _ = self.command_tx.send(PlayerCommand::SetPosition {
                track_id: id,
                position_ms: position.as_millis().max(0) as u64,
            });
        }
        Ok(())
    }
    async fn open_uri(&self, _uri: String) -> fdo::Result<()> {
        Ok(())
    }
    async fn playback_status(&self) -> fdo::Result<PlaybackStatus> {
        Ok(self.state.lock().unwrap().playback_status)
    }
    async fn loop_status(&self) -> fdo::Result<LoopStatus> {
        Ok(LoopStatus::None)
    }
    async fn set_loop_status(&self, _loop_status: LoopStatus) -> mpris_server::zbus::Result<()> {
        Ok(())
    }
    async fn rate(&self) -> fdo::Result<PlaybackRate> {
        Ok(1.0)
    }
    async fn set_rate(&self, _rate: PlaybackRate) -> mpris_server::zbus::Result<()> {
        Ok(())
    }
    async fn shuffle(&self) -> fdo::Result<bool> {
        Ok(false)
    }
    async fn set_shuffle(&self, _shuffle: bool) -> mpris_server::zbus::Result<()> {
        Ok(())
    }
    async fn metadata(&self) -> fdo::Result<Metadata> {
        Ok(self.state.lock().unwrap().metadata.clone())
    }
    async fn volume(&self) -> fdo::Result<Volume> {
        Ok(self.state.lock().unwrap().volume)
    }
    async fn set_volume(&self, volume: Volume) -> mpris_server::zbus::Result<()> {
        let _ = self.command_tx.send(PlayerCommand::SetVolume(volume));
        Ok(())
    }
    async fn position(&self) -> fdo::Result<Time> {
        Ok(Time::from_millis(
            self.state.lock().unwrap().position_ms as i64,
        ))
    }
    async fn minimum_rate(&self) -> fdo::Result<PlaybackRate> {
        Ok(1.0)
    }
    async fn maximum_rate(&self) -> fdo::Result<PlaybackRate> {
        Ok(1.0)
    }
    async fn can_go_next(&self) -> fdo::Result<bool> {
        Ok(self.state.lock().unwrap().can_go_next)
    }
    async fn can_go_previous(&self) -> fdo::Result<bool> {
        Ok(self.state.lock().unwrap().can_go_previous)
    }
    async fn can_play(&self) -> fdo::Result<bool> {
        Ok(true)
    }
    async fn can_pause(&self) -> fdo::Result<bool> {
        Ok(true)
    }
    async fn can_seek(&self) -> fdo::Result<bool> {
        Ok(true)
    }
    async fn can_control(&self) -> fdo::Result<bool> {
        Ok(true)
    }
}

/// Handle for pushing state into the running MPRIS service. Cloning is
/// cheap (an `Arc` clone) so it can live in shared app state alongside
/// the real player.
#[derive(Clone)]
pub struct MprisHandle {
    server: Arc<Server<MprisImpl>>,
}

impl MprisHandle {
    /// Pushes a new snapshot, spawning a short-lived task to apply it —
    /// [`Server::properties_changed`] is async, but callers (the 200ms
    /// tick loop) call this from a synchronous section holding other
    /// locks, so the actual D-Bus work happens after this returns.
    pub fn update(&self, snapshot: PlayerSnapshot) {
        let server = self.server.clone();
        tokio::spawn(async move {
            apply_snapshot(&server, snapshot).await;
        });
    }

    /// Emits MPRIS's `Seeked` signal so external clients (a lock-screen
    /// scrubber, another MPRIS-aware widget) notice a position jump
    /// immediately instead of assuming linear playback — call this after
    /// *any* seek, not just ones MPRIS itself requested.
    pub fn notify_seeked(&self, position_ms: u64) {
        let server = self.server.clone();
        tokio::spawn(async move {
            let _ = server
                .emit(Signal::Seeked {
                    position: Time::from_millis(position_ms as i64),
                })
                .await;
        });
    }
}

fn playback_status(state: PlaybackState) -> PlaybackStatus {
    match state {
        PlaybackState::Playing | PlaybackState::Buffering => PlaybackStatus::Playing,
        PlaybackState::Paused => PlaybackStatus::Paused,
        PlaybackState::Stopped => PlaybackStatus::Stopped,
    }
}

fn track_id_for(id: i64) -> TrackId {
    TrackId::try_from(format!("{TRACK_ID_PREFIX}{id}")).unwrap_or(TrackId::NO_TRACK)
}

fn parse_track_id(id: &TrackId) -> Option<i64> {
    id.as_str().strip_prefix(TRACK_ID_PREFIX)?.parse().ok()
}

fn art_url(path: &Path) -> Option<String> {
    url::Url::from_file_path(path).ok().map(|u| u.to_string())
}

/// Applies a relative MPRIS `Seek` offset to a current position, clamped
/// to `[0, duration]` (an offset past either end is a no-op at that
/// boundary, not an error — matches how a physical seek bar behaves).
pub fn apply_seek_offset(position_ms: u64, duration_ms: Option<u64>, offset_ms: i64) -> u64 {
    let target = position_ms as i64 + offset_ms;
    let max = duration_ms.map(|d| d as i64).unwrap_or(i64::MAX);
    target.clamp(0, max) as u64
}

fn build_metadata(snapshot: &PlayerSnapshot) -> Metadata {
    let mut builder = Metadata::builder().title(snapshot.title.clone());
    if let Some(id) = snapshot.track_id {
        builder = builder.trackid(track_id_for(id));
    }
    if let Some(artist) = &snapshot.artist {
        builder = builder.artist([artist.clone()]);
    }
    if let Some(album) = &snapshot.album {
        builder = builder.album(album.clone());
    }
    if let Some(art) = snapshot.art_path.as_deref().and_then(art_url) {
        builder = builder.art_url(art);
    }
    if let Some(duration) = snapshot.duration_ms {
        builder = builder.length(Time::from_millis(duration as i64));
    }
    builder.build()
}

async fn apply_snapshot(server: &Server<MprisImpl>, snapshot: PlayerSnapshot) {
    let status = playback_status(snapshot.state);
    let metadata = build_metadata(&snapshot);
    let has_track = snapshot.track_id.is_some();

    let mut changed = Vec::new();
    {
        let mut state = server.imp().state.lock().unwrap();
        if state.playback_status != status {
            state.playback_status = status;
            changed.push(mpris_server::Property::PlaybackStatus(status));
        }
        if state.metadata != metadata {
            state.metadata = metadata.clone();
            changed.push(mpris_server::Property::Metadata(metadata));
        }
        if (state.volume - snapshot.volume).abs() > f64::EPSILON {
            state.volume = snapshot.volume;
            changed.push(mpris_server::Property::Volume(snapshot.volume));
        }
        if state.can_go_next != has_track {
            state.can_go_next = has_track;
            changed.push(mpris_server::Property::CanGoNext(has_track));
        }
        if state.can_go_previous != has_track {
            state.can_go_previous = has_track;
            changed.push(mpris_server::Property::CanGoPrevious(has_track));
        }
        // Position has no `PropertiesChanged` signal in the MPRIS spec
        // (clients are expected to poll it) — a plain, local write.
        state.position_ms = snapshot.position_ms;
    }

    if !changed.is_empty() {
        if let Err(e) = server.properties_changed(changed).await {
            tracing::warn!("failed to emit MPRIS PropertiesChanged: {e}");
        }
    }
}

/// Starts the MPRIS service on the caller's async runtime and returns a
/// handle for pushing state plus the channel of commands it receives.
/// `identity` is the human-readable player name (MPRIS `Identity`);
/// `bus_name_suffix` becomes `org.mpris.MediaPlayer2.<bus_name_suffix>`.
pub async fn spawn(
    bus_name_suffix: &str,
    identity: &str,
) -> Result<(MprisHandle, UnboundedReceiver<PlayerCommand>)> {
    let (command_tx, command_rx) = mpsc::unbounded_channel();
    let imp = MprisImpl {
        identity: identity.to_string(),
        state: Mutex::new(SharedState {
            metadata: Metadata::new(),
            playback_status: PlaybackStatus::Stopped,
            volume: 1.0,
            position_ms: 0,
            can_go_next: false,
            can_go_previous: false,
        }),
        command_tx,
    };
    let server = Server::new(bus_name_suffix, imp)
        .await
        .map_err(|e| Error::Internal(format!("failed to register MPRIS D-Bus service: {e}")))?;
    Ok((
        MprisHandle {
            server: Arc::new(server),
        },
        command_rx,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn playback_status_maps_buffering_to_playing_since_mpris_has_no_such_state() {
        assert_eq!(
            playback_status(PlaybackState::Playing),
            PlaybackStatus::Playing
        );
        assert_eq!(
            playback_status(PlaybackState::Buffering),
            PlaybackStatus::Playing
        );
        assert_eq!(
            playback_status(PlaybackState::Paused),
            PlaybackStatus::Paused
        );
        assert_eq!(
            playback_status(PlaybackState::Stopped),
            PlaybackStatus::Stopped
        );
    }

    #[test]
    fn track_id_round_trips_through_parsing() {
        let id = track_id_for(42);
        assert_eq!(parse_track_id(&id), Some(42));
    }

    #[test]
    fn parse_track_id_rejects_a_foreign_object_path() {
        let foreign = TrackId::try_from("/org/mpris/MediaPlayer2/TrackList/NoTrack").unwrap();
        assert_eq!(parse_track_id(&foreign), None);
    }

    #[test]
    fn seek_offset_clamps_to_zero_when_it_would_go_negative() {
        assert_eq!(apply_seek_offset(1000, Some(10_000), -5000), 0);
    }

    #[test]
    fn seek_offset_clamps_to_duration_when_it_would_overshoot() {
        assert_eq!(apply_seek_offset(9000, Some(10_000), 5000), 10_000);
    }

    #[test]
    fn seek_offset_applies_normally_within_bounds() {
        assert_eq!(apply_seek_offset(5000, Some(10_000), 1000), 6000);
    }

    #[test]
    fn seek_offset_with_no_known_duration_only_clamps_the_lower_bound() {
        assert_eq!(apply_seek_offset(5000, None, 100_000), 105_000);
        assert_eq!(apply_seek_offset(5000, None, -100_000), 0);
    }

    #[test]
    fn art_url_builds_a_file_uri_from_an_absolute_path() {
        let url = art_url(Path::new("/home/user/.cache/amp/artwork/track-abc.jpg")).unwrap();
        assert_eq!(url, "file:///home/user/.cache/amp/artwork/track-abc.jpg");
    }

    #[test]
    fn build_metadata_omits_absent_optional_fields() {
        let snapshot = PlayerSnapshot {
            track_id: Some(1),
            title: "Song".into(),
            artist: None,
            album: None,
            art_path: None,
            duration_ms: None,
            position_ms: 0,
            state: PlaybackState::Playing,
            volume: 1.0,
        };
        let metadata = build_metadata(&snapshot);
        assert_eq!(metadata.title(), Some("Song"));
        assert!(metadata.artist().is_none());
        assert!(metadata.album().is_none());
    }

    #[test]
    fn build_metadata_includes_present_optional_fields() {
        let snapshot = PlayerSnapshot {
            track_id: Some(7),
            title: "Song".into(),
            artist: Some("Artist".into()),
            album: Some("Album".into()),
            art_path: Some(PathBuf::from("/tmp/art.jpg")),
            duration_ms: Some(180_000),
            position_ms: 0,
            state: PlaybackState::Playing,
            volume: 1.0,
        };
        let metadata = build_metadata(&snapshot);
        assert_eq!(metadata.artist(), Some(vec!["Artist".to_string()]));
        assert_eq!(metadata.album(), Some("Album"));
        assert_eq!(metadata.length(), Some(Time::from_millis(180_000)));
        assert!(metadata.art_url().is_some());
    }
}
