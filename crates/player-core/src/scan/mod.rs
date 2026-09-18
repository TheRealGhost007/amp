//! Library scanning orchestration: walks a root directory, extracts
//! metadata and artwork per file, and diffs the result against the
//! database to detect new/modified/deleted/renamed tracks (spec §22).
//!
//! Deliberately synchronous: this is CPU/IO-bound blocking work, and the
//! correct way to keep the UI thread responsive is for the caller (a
//! Tauri command, added once the frontend is wired in a later phase) to
//! run it inside `tokio::task::spawn_blocking` — making this function
//! itself `async fn` would just be `async` in name, since every call it
//! makes (`std::fs`, `lofty`, `rusqlite`) already blocks.

mod artwork;
pub(crate) mod metadata;
mod walk;

use crate::db::models::NewTrack;
use crate::error::Result;
use crate::Database;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::hash::Hasher;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Default, Serialize)]
pub struct ScanSummary {
    pub added: usize,
    pub updated: usize,
    pub removed: usize,
    pub renamed: usize,
    pub unchanged: usize,
    pub errors: Vec<ScanFileError>,
}

#[derive(Debug, Serialize)]
pub struct ScanFileError {
    pub path: String,
    pub message: String,
}

/// Scans `root` for audio files and reconciles the result with the
/// database. One corrupt/unreadable file is recorded in
/// `ScanSummary::errors` and skipped — it never aborts the scan.
pub fn scan_root(db: &Database, cache_dir: &Path, root: &Path) -> Result<ScanSummary> {
    // One transaction for the whole scan: SQLite's default is to fsync
    // on every auto-committed statement, which is invisible against an
    // in-memory test database but made a real on-disk 50k-file scan take
    // over an hour instead of seconds (see Database::open's WAL note —
    // this is the other half of that same fix). Held via RAII so any
    // early `?` return below rolls back cleanly instead of leaving a
    // half-applied scan committed.
    let txn = db.conn.unchecked_transaction()?;

    let root_str = root.to_string_lossy().to_string();
    db.add_scan_root(&root_str)?;

    let mut summary = ScanSummary::default();
    let on_disk_paths = walk::walk_audio_files(root);

    let known = db.tracks_for_scan_diff(&root_str)?;
    let known_by_path: HashMap<String, _> =
        known.iter().map(|row| (row.path.clone(), row)).collect();
    let mut seen_paths: HashSet<String> = HashSet::new();
    let mut pending_new: Vec<(String, i64)> = Vec::new();

    for path in &on_disk_paths {
        let path_str = path.to_string_lossy().to_string();
        let Some(mtime) = file_mtime(path) else {
            summary.errors.push(ScanFileError {
                path: path_str,
                message: "could not read file metadata".into(),
            });
            continue;
        };
        seen_paths.insert(path_str.clone());

        match known_by_path.get(&path_str) {
            Some(existing) if existing.mtime == mtime => {
                summary.unchanged += 1;
            }
            Some(existing) => {
                let hash = hash_file(path).ok();
                match process_file(db, cache_dir, path, mtime, hash) {
                    Ok(processed) => {
                        db.update_track(existing.id, &processed.new_track)?;
                        processed.index(db, existing.id)?;
                        summary.updated += 1;
                    }
                    Err(message) => summary.errors.push(ScanFileError {
                        path: path_str,
                        message,
                    }),
                }
            }
            None => pending_new.push((path_str, mtime)),
        }
    }

    let missing: Vec<_> = known
        .iter()
        .filter(|row| !seen_paths.contains(&row.path))
        .collect();
    let mut matched_missing_ids: HashSet<i64> = HashSet::new();

    for (path_str, mtime) in pending_new {
        let path = Path::new(&path_str);
        let hash = hash_file(path).ok();

        // Excludes rows already claimed by an earlier `pending_new` entry
        // in this same scan — without that, two on-disk files sharing one
        // content hash (e.g. a deleted track duplicated to two new paths)
        // would both match the same `missing` row, silently repointing it
        // twice and leaving the second file with no DB row at all.
        let rename_source = hash.as_ref().and_then(|h| {
            missing.iter().find(|row| {
                !matched_missing_ids.contains(&row.id)
                    && row.content_hash.as_deref() == Some(h.as_str())
            })
        });

        if let Some(old) = rename_source {
            db.rename_track_path(old.id, &path_str, mtime)?;
            matched_missing_ids.insert(old.id);
            summary.renamed += 1;
            continue;
        }

        match process_file(db, cache_dir, path, mtime, hash) {
            Ok(processed) => {
                let inserted = db.insert_track(&processed.new_track, now())?;
                processed.index(db, inserted.id)?;
                summary.added += 1;
            }
            Err(message) => summary.errors.push(ScanFileError {
                path: path_str,
                message,
            }),
        }
    }

    for row in missing {
        if !matched_missing_ids.contains(&row.id) {
            remove_cached_artwork(cache_dir, row.content_hash.as_deref(), Path::new(&row.path));
            db.remove_track_from_search_index(row.id)?;
            db.delete_track(row.id)?;
            summary.removed += 1;
        }
    }

    db.mark_scan_root_scanned(&root_str, now())?;
    txn.commit()?;
    Ok(summary)
}

/// The result of reading and resolving one file, ready to write to the
/// database. Keeps the human-readable artist/album/genre names alongside
/// the id-based `NewTrack` purely so `index()` can populate the FTS5
/// index without a second round-trip to look names back up by id.
///
/// `pub(crate)` (not `pub`) — reused by `metadata_editor` to re-derive a
/// track's DB row from the file after a tag write, exactly like a real
/// scan would, rather than duplicating this resolution logic.
pub(crate) struct ProcessedFile {
    pub(crate) new_track: NewTrack,
    artist_name: Option<String>,
    album_name: Option<String>,
    genre_name: Option<String>,
}

impl ProcessedFile {
    pub(crate) fn index(&self, db: &Database, track_id: i64) -> Result<()> {
        db.index_track_for_search(
            track_id,
            &self.new_track.title,
            self.artist_name.as_deref().unwrap_or(""),
            self.album_name.as_deref().unwrap_or(""),
            self.genre_name.as_deref().unwrap_or(""),
        )
    }
}

/// Which artist name an album should be grouped under: `album_artist`
/// when present, falling back to the track's own `artist` only when
/// `album_artist` is absent. A compilation's tracks each have a
/// *different* `artist` tag but share one `album_artist` ("Various
/// Artists"); grouping on the track's own artist instead (as this used
/// to) fragmented one physical album into one single-track "album" per
/// artist, since `albums` is keyed `UNIQUE(title, artist_id)`.
fn album_grouping_artist_name(meta: &metadata::TrackMetadata) -> Option<&str> {
    meta.album_artist.as_deref().or(meta.artist.as_deref())
}

/// Reads metadata + resolves artwork for one file, and returns a
/// `NewTrack` ready to insert or update. The only fallible step exposed
/// to the caller is metadata parsing; DB writes (get-or-create
/// artist/album/genre) use `?` since a `Database` error there is a real
/// crate-level failure, not a per-file data problem.
pub(crate) fn process_file(
    db: &Database,
    cache_dir: &Path,
    path: &Path,
    mtime: i64,
    content_hash: Option<String>,
) -> std::result::Result<ProcessedFile, String> {
    let meta = metadata::read_metadata(path)?;

    let artist_id = match &meta.artist {
        Some(name) => Some(db.get_or_create_artist(name).map_err(|e| e.to_string())?.id),
        None => None,
    };
    let genre_id = match &meta.genre {
        Some(name) => Some(db.get_or_create_genre(name).map_err(|e| e.to_string())?.id),
        None => None,
    };
    let album_artist_id = match album_grouping_artist_name(&meta) {
        Some(name) => Some(db.get_or_create_artist(name).map_err(|e| e.to_string())?.id),
        None => None,
    };
    let album_id = match &meta.album {
        Some(title) => Some(
            db.get_or_create_album(title, album_artist_id, meta.year.map(i64::from))
                .map_err(|e| e.to_string())?
                .id,
        ),
        None => None,
    };

    let cache_key = artwork_cache_key(content_hash.as_deref(), path);
    let artwork_cached = artwork::resolve_and_cache_artwork(
        &cache_dir.join("artwork"),
        &cache_key,
        path,
        meta.embedded_art.as_ref(),
    );

    Ok(ProcessedFile {
        new_track: NewTrack {
            path: path.to_string_lossy().to_string(),
            title: meta.title,
            artist_id,
            album_id,
            album_artist: meta.album_artist,
            genre_id,
            track_number: meta.track_number.map(i64::from),
            disc_number: meta.disc_number.map(i64::from),
            year: meta.year.map(i64::from),
            duration_ms: meta.duration_ms,
            has_embedded_art: artwork_cached.is_some(),
            mtime,
            content_hash,
        },
        artist_name: meta.artist,
        album_name: meta.album,
        genre_name: meta.genre,
    })
}

pub(crate) fn file_mtime(path: &Path) -> Option<i64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    let secs = modified.duration_since(UNIX_EPOCH).ok()?.as_secs();
    Some(secs as i64)
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// A cheap (non-cryptographic) whole-file hash used only to recognize
/// that a "new" path and a "missing" path are the same underlying file
/// content (rename detection). Streamed in chunks so hashing a large
/// FLAC doesn't require reading it fully into memory at once. Only ever
/// computed for the small set of files that changed in a given scan, not
/// the whole library, so its cost is bounded regardless of library size.
/// Deterministic per-path fallback used only when [`hash_file`] itself
/// fails (a rare I/O error) — see its call site for why this must still
/// be unique per file rather than a shared constant.
fn hash_path(path: &Path) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    hasher.write(path.to_string_lossy().as_bytes());
    format!("{:016x}", hasher.finish())
}

/// Falling back to a fixed "unknown" key here would let two different
/// files that both fail to hash (a rare I/O error, not the common case)
/// silently collide on the same cached-artwork filename. Hashing the path
/// instead keeps the key unique per file even when content hashing
/// fails. Shared by the write side (`process_file`) and both read-side
/// consumers below (`track_artwork_path`, `remove_cached_artwork`) so the
/// key formula can't drift out of sync between them.
fn artwork_cache_key(content_hash: Option<&str>, path: &Path) -> String {
    format!(
        "track-{}",
        content_hash
            .map(str::to_string)
            .unwrap_or_else(|| hash_path(path))
    )
}

/// Resolves the on-disk cached artwork file for an already-scanned track,
/// if one exists — the counterpart read to `resolve_and_cache_artwork`'s
/// write, used by callers (MPRIS metadata, track-change notifications)
/// that need the actual file path rather than just "has art: yes/no".
/// Recomputes the same `track-<hash>` key `process_file` cached under
/// rather than storing the resolved path in the DB, since the key is
/// cheap to rederive and this keeps the schema from needing a column
/// that's only ever a derived value.
pub fn track_artwork_path(cache_dir: &Path, track: &crate::db::models::Track) -> Option<PathBuf> {
    let cache_key = artwork_cache_key(track.content_hash.as_deref(), Path::new(&track.path));
    let artwork_dir = cache_dir.join("artwork");
    let entries = fs::read_dir(&artwork_dir).ok()?;
    entries
        .flatten()
        .map(|entry| entry.path())
        .find(|path| path.file_stem().and_then(|s| s.to_str()) == Some(cache_key.as_str()))
}

/// Permanently removes a scan root and every track that was ever scanned
/// from it (plus their cached artwork and search-index entries) — the
/// real implementation behind Settings > Library's "Remove" button.
/// `Database::remove_scan_root` alone only stops the root from being
/// rescanned in the future; without this, every track it had already
/// contributed stayed in the library forever, orphaned from any root and
/// indistinguishable in Library/Albums/Artists from a track whose folder
/// is still configured — an unbounded, permanent leak of both DB rows
/// and their cached artwork files, since nothing else was ever going to
/// notice they belonged to a now-removed root. Uses the same
/// `tracks_for_scan_diff` prefix match `scan_root` itself uses to decide
/// what belongs to a root, so "everything this removal deletes" is
/// exactly "everything a rescan of this same root would still recognize
/// as its own." One transaction for the whole operation, same reasoning
/// as `scan_root`'s own: a large library's removal round-tripping SQLite
/// autocommit's fsync-per-statement for every track would be needlessly
/// slow, and a partial removal left half-done by an interruption would
/// be worse than either finishing or rolling back cleanly.
pub fn remove_scan_root_and_its_tracks(
    db: &Database,
    cache_dir: &Path,
    root_path: &str,
) -> Result<usize> {
    let txn = db.conn.unchecked_transaction()?;
    let tracks = db.tracks_for_scan_diff(root_path)?;
    for track in &tracks {
        remove_cached_artwork(
            cache_dir,
            track.content_hash.as_deref(),
            Path::new(&track.path),
        );
        db.remove_track_from_search_index(track.id)?;
        db.delete_track(track.id)?;
    }
    db.remove_scan_root(root_path)?;
    txn.commit()?;
    Ok(tracks.len())
}

/// Deletes a track's cached artwork file, if any — the cleanup
/// counterpart to `resolve_and_cache_artwork`'s write, called wherever a
/// track row is permanently removed (a rescan noticing the file is gone,
/// or the "Remove From Library" command) so the artwork cache doesn't
/// grow forever for tracks that no longer exist in the library. Takes
/// the raw `content_hash`/`path` fields rather than a full `Track` so it
/// works equally for a `Track` and a scan-internal `ScanDiffRow`. The
/// cache key is derived from this specific track's own content hash (or
/// its path, as the same fallback `process_file` uses), never shared
/// with another track's entry, so removing it can't affect any other
/// track's cached art. Best-effort: a missing or unremovable file is not
/// an error worth surfacing — the track row is already gone either way.
pub fn remove_cached_artwork(cache_dir: &Path, content_hash: Option<&str>, path: &Path) {
    let cache_key = artwork_cache_key(content_hash, path);
    let artwork_dir = cache_dir.join("artwork");
    let Ok(entries) = fs::read_dir(&artwork_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.file_stem().and_then(|s| s.to_str()) == Some(cache_key.as_str()) {
            let _ = fs::remove_file(entry_path);
        }
    }
}

pub(crate) fn hash_file(path: &Path) -> std::io::Result<String> {
    use std::io::Read;
    let mut file = fs::File::open(path)?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buf)?;
        if read == 0 {
            break;
        }
        hasher.write(&buf[..read]);
    }
    Ok(format!("{:016x}", hasher.finish()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn hash_path_is_deterministic_and_distinguishes_files() {
        let a = Path::new("/music/one.flac");
        let b = Path::new("/music/two.flac");
        assert_eq!(hash_path(a), hash_path(a));
        assert_ne!(hash_path(a), hash_path(b));
    }

    fn test_meta(artist: Option<&str>, album_artist: Option<&str>) -> metadata::TrackMetadata {
        metadata::TrackMetadata {
            title: "Title".into(),
            artist: artist.map(String::from),
            album: Some("Album".into()),
            album_artist: album_artist.map(String::from),
            genre: None,
            track_number: None,
            disc_number: None,
            year: None,
            duration_ms: 0,
            embedded_art: None,
        }
    }

    #[test]
    fn album_grouping_prefers_album_artist_over_the_track_s_own_artist() {
        // Regression test: a compilation's tracks each have a different
        // `artist` tag but share one `album_artist` ("Various Artists").
        // Grouping on the track's own artist instead of album_artist
        // fragmented one physical album into one single-track "album"
        // per artist, since `albums` is keyed UNIQUE(title, artist_id).
        let meta = test_meta(Some("Artist One"), Some("Various Artists"));
        assert_eq!(album_grouping_artist_name(&meta), Some("Various Artists"));
    }

    #[test]
    fn album_grouping_falls_back_to_artist_when_album_artist_is_absent() {
        let meta = test_meta(Some("Solo Artist"), None);
        assert_eq!(album_grouping_artist_name(&meta), Some("Solo Artist"));
    }

    #[test]
    fn album_grouping_is_none_when_neither_tag_is_present() {
        let meta = test_meta(None, None);
        assert_eq!(album_grouping_artist_name(&meta), None);
    }

    fn test_track(path: &str, content_hash: Option<&str>) -> crate::db::models::Track {
        crate::db::models::Track {
            id: 1,
            path: path.to_string(),
            title: "Title".to_string(),
            artist_id: None,
            album_id: None,
            album_artist: None,
            genre_id: None,
            track_number: None,
            disc_number: None,
            year: None,
            duration_ms: 0,
            has_embedded_art: content_hash.is_some(),
            mtime: 0,
            content_hash: content_hash.map(str::to_string),
            added_at: 0,
        }
    }

    #[test]
    fn track_artwork_path_finds_a_cached_file_by_content_hash() {
        let dir = TestDir::new("artwork-lookup-hit");
        let artwork_dir = dir.path.join("artwork");
        fs::create_dir_all(&artwork_dir).unwrap();
        fs::write(artwork_dir.join("track-abc123.png"), b"fake-art").unwrap();
        let track = test_track("/music/song.flac", Some("abc123"));

        let found = track_artwork_path(&dir.path, &track).unwrap();

        assert_eq!(found, artwork_dir.join("track-abc123.png"));
    }

    #[test]
    fn track_artwork_path_falls_back_to_hashing_the_path_without_a_content_hash() {
        let dir = TestDir::new("artwork-lookup-fallback");
        let track = test_track("/music/song.flac", None);
        let artwork_dir = dir.path.join("artwork");
        fs::create_dir_all(&artwork_dir).unwrap();
        fs::write(
            artwork_dir.join(format!("track-{}.jpg", hash_path(Path::new(&track.path)))),
            b"fake-art",
        )
        .unwrap();

        assert!(track_artwork_path(&dir.path, &track).is_some());
    }

    #[test]
    fn track_artwork_path_is_none_when_nothing_was_ever_cached() {
        let dir = TestDir::new("artwork-lookup-miss");
        let track = test_track("/music/song.flac", Some("abc123"));

        assert!(track_artwork_path(&dir.path, &track).is_none());
    }

    #[test]
    fn remove_cached_artwork_deletes_the_matching_file() {
        let dir = TestDir::new("artwork-remove-hit");
        let artwork_dir = dir.path.join("artwork");
        fs::create_dir_all(&artwork_dir).unwrap();
        let cached_file = artwork_dir.join("track-abc123.png");
        fs::write(&cached_file, b"fake-art").unwrap();
        let track = test_track("/music/song.flac", Some("abc123"));

        remove_cached_artwork(
            &dir.path,
            track.content_hash.as_deref(),
            Path::new(&track.path),
        );

        assert!(!cached_file.exists());
    }

    #[test]
    fn remove_cached_artwork_of_one_track_does_not_touch_another_tracks_cache_file() {
        let dir = TestDir::new("artwork-remove-isolated");
        let artwork_dir = dir.path.join("artwork");
        fs::create_dir_all(&artwork_dir).unwrap();
        let other_file = artwork_dir.join("track-def456.png");
        fs::write(&other_file, b"other-track-art").unwrap();
        let track = test_track("/music/song.flac", Some("abc123"));

        remove_cached_artwork(
            &dir.path,
            track.content_hash.as_deref(),
            Path::new(&track.path),
        );

        assert!(other_file.exists());
    }

    #[test]
    fn remove_cached_artwork_on_a_missing_cache_dir_does_not_panic() {
        let dir = TestDir::new("artwork-remove-no-cache-dir");
        let track = test_track("/music/song.flac", Some("abc123"));

        remove_cached_artwork(
            &dir.path,
            track.content_hash.as_deref(),
            Path::new(&track.path),
        );
    }

    struct TestDir {
        path: std::path::PathBuf,
    }

    impl TestDir {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "amp-scan-integration-{name}-{}",
                std::process::id()
            ));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn write_chunk(out: &mut Vec<u8>, fourcc: &[u8; 4], content: &[u8]) {
        out.extend_from_slice(fourcc);
        out.extend_from_slice(&(content.len() as u32).to_le_bytes());
        out.extend_from_slice(content);
        if content.len() % 2 == 1 {
            out.push(0);
        }
    }

    fn write_riff_info_field(out: &mut Vec<u8>, fourcc: &[u8; 4], value: &str) {
        let mut bytes = value.as_bytes().to_vec();
        bytes.push(0);
        write_chunk(out, fourcc, &bytes);
    }

    /// Hand-builds a minimal valid PCM WAV file (8kHz mono 8-bit), with
    /// optional RIFF INFO tags (title/artist/album/genre) — real enough
    /// for lofty to parse duration and tags without needing an actual
    /// audio fixture file checked into the repo.
    fn build_wav(tags: Option<(&str, &str, &str, &str)>, duration_secs: f32) -> Vec<u8> {
        const SAMPLE_RATE: u32 = 8000;
        let num_samples = (SAMPLE_RATE as f32 * duration_secs) as u32;
        let data = vec![0u8; num_samples as usize];

        let mut fmt_chunk = Vec::new();
        fmt_chunk.extend_from_slice(&1u16.to_le_bytes()); // PCM
        fmt_chunk.extend_from_slice(&1u16.to_le_bytes()); // mono
        fmt_chunk.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
        fmt_chunk.extend_from_slice(&SAMPLE_RATE.to_le_bytes()); // byte rate (1 byte/sample)
        fmt_chunk.extend_from_slice(&1u16.to_le_bytes()); // block align
        fmt_chunk.extend_from_slice(&8u16.to_le_bytes()); // bits per sample

        let mut riff_body = Vec::new();
        riff_body.extend_from_slice(b"WAVE");
        write_chunk(&mut riff_body, b"fmt ", &fmt_chunk);

        if let Some((title, artist, album, genre)) = tags {
            let mut info_body = Vec::new();
            info_body.extend_from_slice(b"INFO");
            write_riff_info_field(&mut info_body, b"INAM", title);
            write_riff_info_field(&mut info_body, b"IART", artist);
            write_riff_info_field(&mut info_body, b"IPRD", album);
            write_riff_info_field(&mut info_body, b"IGNR", genre);
            write_chunk(&mut riff_body, b"LIST", &info_body);
        }

        write_chunk(&mut riff_body, b"data", &data);

        let mut out = Vec::new();
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(riff_body.len() as u32).to_le_bytes());
        out.extend_from_slice(&riff_body);
        out
    }

    fn set_mtime(path: &Path, seconds_since_epoch: u64) {
        let file = fs::File::options().write(true).open(path).unwrap();
        file.set_modified(UNIX_EPOCH + Duration::from_secs(seconds_since_epoch))
            .unwrap();
    }

    #[test]
    fn scan_finds_new_tagged_file_and_populates_db() {
        let dir = TestDir::new("new-file");
        let cache = dir.path.join("cache");
        let audio_path = dir.path.join("one-more-time.wav");
        fs::write(
            &audio_path,
            build_wav(
                Some(("One More Time", "Daft Punk", "Discovery", "Electronic")),
                0.5,
            ),
        )
        .unwrap();

        let db = Database::open_in_memory().unwrap();
        let summary = scan_root(&db, &cache, &dir.path).unwrap();

        assert_eq!(summary.added, 1);
        assert!(summary.errors.is_empty());

        let tracks = db.list_tracks().unwrap();
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].title, "One More Time");
        assert!(tracks[0].duration_ms > 0);
        assert!(tracks[0].content_hash.is_some());

        let artist = db.get_or_create_artist("Daft Punk").unwrap();
        assert_eq!(tracks[0].artist_id, Some(artist.id));

        assert_eq!(db.search_tracks("daft", 10).unwrap(), vec![tracks[0].id]);
    }

    #[test]
    fn rescanning_unchanged_directory_is_a_no_op() {
        let dir = TestDir::new("unchanged");
        let cache = dir.path.join("cache");
        fs::write(dir.path.join("track.wav"), build_wav(None, 0.2)).unwrap();

        let db = Database::open_in_memory().unwrap();
        scan_root(&db, &cache, &dir.path).unwrap();
        let second = scan_root(&db, &cache, &dir.path).unwrap();

        assert_eq!(second.added, 0);
        assert_eq!(second.unchanged, 1);
        assert_eq!(db.list_tracks().unwrap().len(), 1);
    }

    #[test]
    fn untagged_file_falls_back_to_filename_title() {
        let dir = TestDir::new("untagged");
        let cache = dir.path.join("cache");
        fs::write(dir.path.join("Some Track.wav"), build_wav(None, 0.2)).unwrap();

        let db = Database::open_in_memory().unwrap();
        scan_root(&db, &cache, &dir.path).unwrap();

        let tracks = db.list_tracks().unwrap();
        assert_eq!(tracks[0].title, "Some Track");
        assert_eq!(tracks[0].artist_id, None);
    }

    #[test]
    fn scan_detects_modified_file() {
        let dir = TestDir::new("modified");
        let cache = dir.path.join("cache");
        let path = dir.path.join("track.wav");
        fs::write(&path, build_wav(Some(("Old Title", "A", "B", "C")), 0.2)).unwrap();
        set_mtime(&path, 1_700_000_000);

        let db = Database::open_in_memory().unwrap();
        scan_root(&db, &cache, &dir.path).unwrap();

        fs::write(&path, build_wav(Some(("New Title", "A", "B", "C")), 0.2)).unwrap();
        set_mtime(&path, 1_700_000_100);

        let summary = scan_root(&db, &cache, &dir.path).unwrap();
        assert_eq!(summary.updated, 1);
        assert_eq!(summary.added, 0);

        let tracks = db.list_tracks().unwrap();
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].title, "New Title");
    }

    #[test]
    fn scan_detects_deleted_file() {
        let dir = TestDir::new("deleted");
        let cache = dir.path.join("cache");
        let path = dir.path.join("track.wav");
        fs::write(&path, build_wav(None, 0.2)).unwrap();

        let db = Database::open_in_memory().unwrap();
        scan_root(&db, &cache, &dir.path).unwrap();
        assert_eq!(db.list_tracks().unwrap().len(), 1);

        fs::remove_file(&path).unwrap();
        let summary = scan_root(&db, &cache, &dir.path).unwrap();

        assert_eq!(summary.removed, 1);
        assert!(db.list_tracks().unwrap().is_empty());
    }

    #[test]
    fn scan_detects_deleted_file_and_removes_its_cached_artwork() {
        let dir = TestDir::new("deleted-with-artwork");
        let cache = dir.path.join("cache");
        let path = dir.path.join("track.wav");
        fs::write(&path, build_wav(None, 0.2)).unwrap();
        // Folder art, not embedded, since `build_wav` doesn't embed real
        // tag art — this still exercises the same cache-write path
        // (`process_file` -> `resolve_and_cache_artwork`) that embedded
        // art would.
        fs::write(dir.path.join("cover.jpg"), b"fake-cover-bytes").unwrap();

        let db = Database::open_in_memory().unwrap();
        scan_root(&db, &cache, &dir.path).unwrap();
        let track = db.list_tracks().unwrap().into_iter().next().unwrap();
        let cached_path = track_artwork_path(&cache, &track)
            .expect("folder art should have been cached on first scan");
        assert!(cached_path.exists());

        fs::remove_file(&path).unwrap();
        let summary = scan_root(&db, &cache, &dir.path).unwrap();

        assert_eq!(summary.removed, 1);
        assert!(
            !cached_path.exists(),
            "cached artwork must not outlive the track row it belonged to"
        );
    }

    #[test]
    fn remove_scan_root_and_its_tracks_deletes_tracks_artwork_and_the_root_itself() {
        let dir = TestDir::new("remove-root");
        let cache = dir.path.join("cache");
        let root = dir.path.join("music");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("track.wav"), build_wav(None, 0.2)).unwrap();
        fs::write(root.join("cover.jpg"), b"fake-cover-bytes").unwrap();

        let db = Database::open_in_memory().unwrap();
        scan_root(&db, &cache, &root).unwrap();
        let track = db.list_tracks().unwrap().into_iter().next().unwrap();
        let cached_path = track_artwork_path(&cache, &track).unwrap();
        assert!(cached_path.exists());
        assert_eq!(
            db.list_scan_roots().unwrap(),
            vec![root.to_string_lossy().to_string()]
        );

        let removed =
            remove_scan_root_and_its_tracks(&db, &cache, &root.to_string_lossy()).unwrap();

        assert_eq!(removed, 1);
        assert!(db.list_tracks().unwrap().is_empty());
        assert!(db.list_scan_roots().unwrap().is_empty());
        assert!(
            !cached_path.exists(),
            "cached artwork must not outlive the scan root it belonged to"
        );
    }

    #[test]
    fn remove_scan_root_and_its_tracks_does_not_touch_a_different_roots_tracks() {
        let dir = TestDir::new("remove-root-isolated");
        let cache = dir.path.join("cache");
        let root_a = dir.path.join("music-a");
        let root_b = dir.path.join("music-b");
        fs::create_dir_all(&root_a).unwrap();
        fs::create_dir_all(&root_b).unwrap();
        fs::write(root_a.join("a.wav"), build_wav(None, 0.2)).unwrap();
        fs::write(root_b.join("b.wav"), build_wav(None, 0.2)).unwrap();

        let db = Database::open_in_memory().unwrap();
        scan_root(&db, &cache, &root_a).unwrap();
        scan_root(&db, &cache, &root_b).unwrap();
        assert_eq!(db.list_tracks().unwrap().len(), 2);

        let removed =
            remove_scan_root_and_its_tracks(&db, &cache, &root_a.to_string_lossy()).unwrap();

        assert_eq!(removed, 1);
        let remaining = db.list_tracks().unwrap();
        assert_eq!(remaining.len(), 1);
        assert!(remaining[0]
            .path
            .starts_with(&root_b.to_string_lossy().to_string()));
        assert_eq!(
            db.list_scan_roots().unwrap(),
            vec![root_b.to_string_lossy().to_string()]
        );
    }

    #[test]
    fn scan_detects_renamed_file_and_preserves_favorite() {
        let dir = TestDir::new("renamed");
        let cache = dir.path.join("cache");
        let old_path = dir.path.join("old-name.wav");
        fs::write(
            &old_path,
            build_wav(Some(("Track", "Artist", "Album", "Genre")), 0.2),
        )
        .unwrap();

        let db = Database::open_in_memory().unwrap();
        scan_root(&db, &cache, &dir.path).unwrap();
        let original_id = db.list_tracks().unwrap()[0].id;
        db.add_favorite(original_id, 1).unwrap();

        let new_path = dir.path.join("new-name.wav");
        fs::rename(&old_path, &new_path).unwrap();

        let summary = scan_root(&db, &cache, &dir.path).unwrap();
        assert_eq!(summary.renamed, 1);
        assert_eq!(summary.added, 0);
        assert_eq!(summary.removed, 0);

        let tracks = db.list_tracks().unwrap();
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].id, original_id);
        assert_eq!(tracks[0].path, new_path.to_string_lossy());
        assert!(db.is_favorite(original_id).unwrap());
    }

    #[test]
    fn scan_matches_at_most_one_new_file_per_missing_row_when_content_hashes_collide() {
        // Regression test: the rename-detection match previously searched
        // the full `missing` list without excluding rows already claimed
        // earlier in the same scan. If two on-disk files share one content
        // hash with a single now-missing row, both would match it — the
        // second `rename_track_path` call would silently repoint the same
        // row a second time, leaving the first file with no DB row at all.
        let dir = TestDir::new("duplicate-rename-target");
        let cache = dir.path.join("cache");
        let original_path = dir.path.join("original.wav");
        let content = build_wav(Some(("Track", "Artist", "Album", "Genre")), 0.2);
        fs::write(&original_path, &content).unwrap();

        let db = Database::open_in_memory().unwrap();
        scan_root(&db, &cache, &dir.path).unwrap();
        assert_eq!(db.list_tracks().unwrap().len(), 1);

        // Delete the original and replace it with two byte-identical
        // copies — both hash the same as the now-missing row.
        fs::remove_file(&original_path).unwrap();
        fs::write(dir.path.join("copy-b.wav"), &content).unwrap();
        fs::write(dir.path.join("copy-c.wav"), &content).unwrap();

        let summary = scan_root(&db, &cache, &dir.path).unwrap();

        // Exactly one duplicate can be a genuine rename of the missing
        // row; the other must be inserted as a new track, not dropped.
        assert_eq!(summary.renamed, 1);
        assert_eq!(summary.added, 1);
        assert_eq!(db.list_tracks().unwrap().len(), 2);
    }

    #[test]
    fn scan_skips_corrupt_file_but_keeps_going() {
        let dir = TestDir::new("corrupt");
        let cache = dir.path.join("cache");
        fs::write(dir.path.join("good.wav"), build_wav(None, 0.2)).unwrap();
        fs::write(dir.path.join("corrupt.mp3"), b"this is not a real mp3 file").unwrap();

        let db = Database::open_in_memory().unwrap();
        let summary = scan_root(&db, &cache, &dir.path).unwrap();

        assert_eq!(summary.added, 1);
        assert_eq!(summary.errors.len(), 1);
        assert!(summary.errors[0].path.ends_with("corrupt.mp3"));
        assert_eq!(db.list_tracks().unwrap().len(), 1);
    }

    /// Perf fixture from the Phase 3 exit criteria: a 50k-file synthetic
    /// library must scan without freezing. Expensive to set up (50k real
    /// files on disk), so `#[ignore]`d by default — run explicitly with
    /// `cargo test -p player-core --release -- --ignored scan_of_50k`.
    /// Timing observed on this machine is recorded in ARCHITECTURE.md.
    #[test]
    #[ignore]
    fn scan_of_50k_files_completes_without_freezing() {
        let dir = TestDir::new("fifty-thousand");
        let cache = dir.path.join("cache");

        const DIRS: usize = 500;
        const FILES_PER_DIR: usize = 100;
        let tiny_wav = build_wav(None, 0.01);
        for d in 0..DIRS {
            let subdir = dir.path.join(format!("Artist {d}/Album"));
            fs::create_dir_all(&subdir).unwrap();
            for f in 0..FILES_PER_DIR {
                fs::write(subdir.join(format!("Track {f}.wav")), &tiny_wav).unwrap();
            }
        }

        let db = Database::open_in_memory().unwrap();
        let started = std::time::Instant::now();
        let summary = scan_root(&db, &cache, &dir.path).unwrap();
        let elapsed = started.elapsed();

        assert_eq!(summary.added, DIRS * FILES_PER_DIR);
        assert!(summary.errors.is_empty());
        assert_eq!(db.list_tracks().unwrap().len(), DIRS * FILES_PER_DIR);
        println!("scanned {} files in {:?}", DIRS * FILES_PER_DIR, elapsed);
    }
}
