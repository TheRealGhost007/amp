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
mod metadata;
mod walk;

use crate::db::models::NewTrack;
use crate::error::Result;
use crate::Database;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::hash::Hasher;
use std::path::Path;
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

        let rename_source = hash.as_ref().and_then(|h| {
            missing
                .iter()
                .find(|row| row.content_hash.as_deref() == Some(h.as_str()))
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
struct ProcessedFile {
    new_track: NewTrack,
    artist_name: Option<String>,
    album_name: Option<String>,
    genre_name: Option<String>,
}

impl ProcessedFile {
    fn index(&self, db: &Database, track_id: i64) -> Result<()> {
        db.index_track_for_search(
            track_id,
            &self.new_track.title,
            self.artist_name.as_deref().unwrap_or(""),
            self.album_name.as_deref().unwrap_or(""),
            self.genre_name.as_deref().unwrap_or(""),
        )
    }
}

/// Reads metadata + resolves artwork for one file, and returns a
/// `NewTrack` ready to insert or update. The only fallible step exposed
/// to the caller is metadata parsing; DB writes (get-or-create
/// artist/album/genre) use `?` since a `Database` error there is a real
/// crate-level failure, not a per-file data problem.
fn process_file(
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
    let album_id = match &meta.album {
        Some(title) => Some(
            db.get_or_create_album(title, artist_id, meta.year.map(i64::from))
                .map_err(|e| e.to_string())?
                .id,
        ),
        None => None,
    };

    // Falling back to a fixed "unknown" key here would let two different
    // files that both fail to hash (a rare I/O error, not the common
    // case) silently overwrite each other's cached artwork under the
    // same cache filename. Hashing the path instead keeps the key unique
    // per file even when content hashing fails.
    let cache_key = format!(
        "track-{}",
        content_hash.clone().unwrap_or_else(|| hash_path(path))
    );
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

fn file_mtime(path: &Path) -> Option<i64> {
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

fn hash_file(path: &Path) -> std::io::Result<String> {
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
