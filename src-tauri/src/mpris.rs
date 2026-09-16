//! Bridges `linux_integration::mpris` to the real `audio_engine::Player`
//! and `player_core::Database` — the one place allowed to know about
//! both, since neither of those crates (nor `linux-integration` itself)
//! may depend on each other for this. `Player` only ever tracks a bare
//! `TrackRef { id, uri }` (deliberately independent of `player-core`'s
//! richer `Track` model, per that type's own doc comment), so turning
//! "the current track" into MPRIS-displayable title/artist/album/artwork
//! needs a DB lookup — done here, not in `linux-integration`.

use audio_engine::PlaybackState;
use linux_integration::mpris::PlayerSnapshot;
use linux_integration::notifications::TrackChangeNotification;
use player_core::Database;
use std::path::{Path, PathBuf};

/// Settings key for the "notify on track change" toggle (Settings >
/// Notifications) — a plain boolean, defaulting to `true` when unset.
pub const NOTIFICATIONS_SETTING_KEY: &str = "notifications.track_change_enabled";

struct CachedTrack {
    id: i64,
    title: String,
    artist: Option<String>,
    album: Option<String>,
    art_path: Option<PathBuf>,
}

/// Caches the current track's display fields so the 200ms tick loop only
/// hits the database when the track actually changes, not on every tick
/// — position/state/volume still update every tick via [`Self::snapshot`],
/// which is cheap (`linux_integration::mpris` only touches D-Bus for
/// properties that actually changed).
#[derive(Default)]
pub struct NowPlayingTracker {
    cached: Option<CachedTrack>,
}

impl NowPlayingTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Refreshes the cached display fields if `track_id` differs from
    /// what's cached, and reports whether a *genuinely new* track just
    /// started (i.e. `track_id` is `Some` and different from before) —
    /// the one moment a track-change notification should fire. Going
    /// from `Some` to `None` (playback stopped) is a change worth
    /// clearing the cache for, but not one worth notifying about.
    pub fn refresh_if_changed(
        &mut self,
        db: &Database,
        cache_dir: &Path,
        track_id: Option<i64>,
    ) -> bool {
        let cached_id = self.cached.as_ref().map(|c| c.id);
        if cached_id == track_id {
            return false;
        }
        self.cached = track_id.and_then(|id| Self::load(db, cache_dir, id));
        track_id.is_some()
    }

    fn load(db: &Database, cache_dir: &Path, id: i64) -> Option<CachedTrack> {
        let display = db.get_track_for_browse(id).ok().flatten()?;
        let art_path = db
            .get_track(id)
            .ok()
            .flatten()
            .and_then(|track| player_core::track_artwork_path(cache_dir, &track));
        Some(CachedTrack {
            id,
            title: display.title,
            artist: display.artist_name,
            album: display.album_title,
            art_path,
        })
    }

    pub fn snapshot(
        &self,
        position_ms: u64,
        duration_ms: Option<u64>,
        state: PlaybackState,
        volume: f64,
    ) -> PlayerSnapshot {
        match &self.cached {
            Some(c) => PlayerSnapshot {
                track_id: Some(c.id),
                title: c.title.clone(),
                artist: c.artist.clone(),
                album: c.album.clone(),
                art_path: c.art_path.clone(),
                duration_ms,
                position_ms,
                state,
                volume,
            },
            None => PlayerSnapshot {
                track_id: None,
                title: String::new(),
                artist: None,
                album: None,
                art_path: None,
                duration_ms: None,
                position_ms: 0,
                state,
                volume,
            },
        }
    }

    pub fn notification(&self) -> Option<TrackChangeNotification<'_>> {
        self.cached.as_ref().map(|c| TrackChangeNotification {
            title: &c.title,
            artist: c.artist.as_deref(),
            album: c.album.as_deref(),
            artwork_path: c.art_path.as_deref(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use player_core::db::models::NewTrack;

    fn insert_track(db: &Database, title: &str) -> i64 {
        let track = NewTrack {
            path: format!("/music/{title}.flac"),
            title: title.to_string(),
            artist_id: None,
            album_id: None,
            album_artist: None,
            genre_id: None,
            track_number: None,
            disc_number: None,
            year: None,
            duration_ms: 1000,
            has_embedded_art: false,
            mtime: 0,
            content_hash: None,
        };
        db.insert_track(&track, 0).unwrap().id
    }

    #[test]
    fn refresh_reports_no_change_when_the_track_id_is_the_same() {
        let db = Database::open_in_memory().unwrap();
        let id = insert_track(&db, "Song");
        let mut tracker = NowPlayingTracker::new();

        assert!(tracker.refresh_if_changed(&db, Path::new("/tmp"), Some(id)));
        assert!(!tracker.refresh_if_changed(&db, Path::new("/tmp"), Some(id)));
    }

    #[test]
    fn refresh_reports_a_change_when_a_new_track_starts() {
        let db = Database::open_in_memory().unwrap();
        let first = insert_track(&db, "First");
        let second = insert_track(&db, "Second");
        let mut tracker = NowPlayingTracker::new();

        tracker.refresh_if_changed(&db, Path::new("/tmp"), Some(first));
        assert!(tracker.refresh_if_changed(&db, Path::new("/tmp"), Some(second)));
        assert_eq!(
            tracker.snapshot(0, None, PlaybackState::Playing, 1.0).title,
            "Second"
        );
    }

    #[test]
    fn refresh_clears_the_cache_but_does_not_report_a_change_when_playback_stops() {
        let db = Database::open_in_memory().unwrap();
        let id = insert_track(&db, "Song");
        let mut tracker = NowPlayingTracker::new();
        tracker.refresh_if_changed(&db, Path::new("/tmp"), Some(id));

        let notified = tracker.refresh_if_changed(&db, Path::new("/tmp"), None);

        assert!(
            !notified,
            "stopping playback is not a new track to notify about"
        );
        assert!(tracker.notification().is_none());
    }

    #[test]
    fn snapshot_with_no_current_track_reports_no_track_id() {
        let tracker = NowPlayingTracker::new();
        let snapshot = tracker.snapshot(0, None, PlaybackState::Stopped, 1.0);
        assert_eq!(snapshot.track_id, None);
    }
}
