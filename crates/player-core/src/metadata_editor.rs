//! Writes user-edited metadata (and artwork) back to the actual audio
//! file via `lofty`, then re-derives the track's DB row from the
//! just-written file using the same pipeline a real scan uses — rather
//! than duplicating the artist/album/genre resolution and artwork-cache
//! logic here, `metadata_editor` re-reads the file it just wrote and
//! hands off to `scan::process_file`, guaranteeing the DB always
//! reflects exactly what a fresh scan of this file would produce.

use crate::db::models::TrackListItem;
use crate::db::Database;
use crate::error::{Error, Result};
use crate::scan;
use lofty::config::WriteOptions;
use lofty::file::TaggedFileExt;
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::tag::{Accessor, ItemKey, Tag, TagExt};
use std::path::{Path, PathBuf};

pub struct MetadataUpdate {
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub genre: Option<String>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<i32>,
    pub artwork: ArtworkUpdate,
}

pub enum ArtworkUpdate {
    /// Leave whatever artwork (or lack of it) the file already has.
    Unchanged,
    /// Strip any embedded cover art from the file.
    Remove,
    /// Replace (or add) embedded cover art with `data`. `extension` is
    /// the source image's extension (e.g. `"jpg"`), used only to guess a
    /// MIME type for the embedded picture.
    Replace { data: Vec<u8>, extension: String },
}

/// Validates that `path`'s canonical form is inside at least one of
/// `roots`' canonical forms — spec §37: metadata/filenames are
/// untrusted, and a file write must never be able to escape the user's
/// configured library folders via a crafted path, a symlink, or a
/// `..`-traversal. Canonicalizing both sides (not just string-prefix
/// matching the raw paths) is what actually closes the symlink/`..`
/// loophole.
fn validate_path_within_roots(path: &Path, roots: &[String]) -> Result<()> {
    let canonical = path
        .canonicalize()
        .map_err(|e| Error::PathOutsideLibrary(format!("{}: {e}", path.display())))?;

    let inside_a_root = roots.iter().any(|root| {
        Path::new(root)
            .canonicalize()
            .is_ok_and(|canonical_root| canonical.starts_with(&canonical_root))
    });

    if inside_a_root {
        Ok(())
    } else {
        Err(Error::PathOutsideLibrary(path.display().to_string()))
    }
}

fn mime_type_for_extension(extension: &str) -> MimeType {
    match extension.to_ascii_lowercase().as_str() {
        "png" => MimeType::Png,
        "gif" => MimeType::Gif,
        "bmp" => MimeType::Bmp,
        "tif" | "tiff" => MimeType::Tiff,
        // Defaults to JPEG (by far the most common embedded-art format)
        // rather than `Unknown` for anything else the frontend's file
        // picker might hand back (e.g. "jpeg" itself, or an unexpected
        // case) — an approximate but harmless MIME type beats an
        // "unknown" one for a field that's advisory metadata anyway.
        _ => MimeType::Jpeg,
    }
}

fn write_tags(path: &Path, update: &MetadataUpdate) -> std::result::Result<(), String> {
    let mut tagged_file = lofty::read_from_path(path).map_err(|e| e.to_string())?;

    if tagged_file.primary_tag().is_none() {
        let tag_type = tagged_file.primary_tag_type();
        tagged_file.insert_tag(Tag::new(tag_type));
    }
    let tag = tagged_file
        .primary_tag_mut()
        .expect("a tag was just inserted above if one didn't already exist");

    tag.set_title(update.title.clone());

    match &update.artist {
        Some(v) => tag.set_artist(v.clone()),
        None => tag.remove_artist(),
    }
    match &update.album {
        Some(v) => tag.set_album(v.clone()),
        None => tag.remove_album(),
    }
    match &update.album_artist {
        Some(v) => {
            tag.insert_text(ItemKey::AlbumArtist, v.clone());
        }
        None => tag.remove_key(ItemKey::AlbumArtist),
    }
    match &update.genre {
        Some(v) => tag.set_genre(v.clone()),
        None => tag.remove_genre(),
    }
    match update.track_number {
        Some(v) => tag.set_track(v),
        None => tag.remove_track(),
    }
    match update.disc_number {
        Some(v) => tag.set_disk(v),
        None => tag.remove_disk(),
    }
    match update.year {
        Some(y) => tag.set_date(lofty::tag::items::Timestamp {
            year: y as u16,
            month: None,
            day: None,
            hour: None,
            minute: None,
            second: None,
        }),
        None => tag.remove_date(),
    }

    match &update.artwork {
        ArtworkUpdate::Unchanged => {}
        ArtworkUpdate::Remove => tag.remove_picture_type(PictureType::CoverFront),
        ArtworkUpdate::Replace { data, extension } => {
            tag.remove_picture_type(PictureType::CoverFront);
            let picture = Picture::unchecked(data.clone())
                .pic_type(PictureType::CoverFront)
                .mime_type(mime_type_for_extension(extension))
                .build();
            tag.push_picture(picture);
        }
    }

    tag.save_to_path(path, WriteOptions::default())
        .map_err(|e| e.to_string())
}

/// Writes `update` to the track's actual file, then re-derives its DB
/// row from the file exactly like a scan would, and returns the
/// refreshed, display-ready row.
pub fn update_track_metadata(
    db: &Database,
    cache_dir: &Path,
    track_id: i64,
    update: &MetadataUpdate,
) -> Result<TrackListItem> {
    let track = db
        .get_track(track_id)?
        .ok_or_else(|| Error::NotFound(format!("no track with id {track_id}")))?;
    let path = PathBuf::from(&track.path);

    let roots = db.list_scan_roots()?;
    validate_path_within_roots(&path, &roots)?;

    write_tags(&path, update).map_err(Error::Internal)?;

    let mtime = scan::file_mtime(&path)
        .ok_or_else(|| Error::Internal(format!("could not read mtime for {}", path.display())))?;
    let content_hash = scan::hash_file(&path).ok();
    let processed =
        scan::process_file(db, cache_dir, &path, mtime, content_hash).map_err(Error::Internal)?;

    db.update_track(track_id, &processed.new_track)?;
    processed.index(db, track_id)?;

    db.get_track_for_browse(track_id)?
        .ok_or_else(|| Error::NotFound(format!("no track with id {track_id}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scan::scan_root;
    use std::fs;

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "amp-metadata-editor-test-{name}-{}",
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

    /// Same hand-built minimal WAV fixture as `scan::tests` uses (real
    /// enough for lofty to read *and write* tags without needing an
    /// audio fixture file checked into the repo) — duplicated rather
    /// than shared, matching this codebase's existing convention of
    /// small, self-contained per-file test helpers.
    fn build_wav(tags: Option<(&str, &str, &str, &str)>, duration_secs: f32) -> Vec<u8> {
        const SAMPLE_RATE: u32 = 8000;
        let num_samples = (SAMPLE_RATE as f32 * duration_secs) as u32;
        let data = vec![0u8; num_samples as usize];

        let mut fmt_chunk = Vec::new();
        fmt_chunk.extend_from_slice(&1u16.to_le_bytes());
        fmt_chunk.extend_from_slice(&1u16.to_le_bytes());
        fmt_chunk.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
        fmt_chunk.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
        fmt_chunk.extend_from_slice(&1u16.to_le_bytes());
        fmt_chunk.extend_from_slice(&8u16.to_le_bytes());

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

    fn no_artwork_update() -> MetadataUpdate {
        MetadataUpdate {
            title: "New Title".to_string(),
            artist: Some("New Artist".to_string()),
            album: Some("New Album".to_string()),
            album_artist: Some("New Album Artist".to_string()),
            genre: Some("New Genre".to_string()),
            track_number: Some(3),
            disc_number: Some(1),
            year: Some(2024),
            artwork: ArtworkUpdate::Unchanged,
        }
    }

    #[test]
    fn validate_path_within_roots_accepts_a_path_inside_a_root() {
        let dir = TestDir::new("accept");
        let track_path = dir.path.join("sub").join("track.wav");
        fs::create_dir_all(track_path.parent().unwrap()).unwrap();
        fs::write(&track_path, b"fake-audio").unwrap();

        let roots = vec![dir.path.to_string_lossy().to_string()];
        assert!(validate_path_within_roots(&track_path, &roots).is_ok());
    }

    #[test]
    fn validate_path_within_roots_rejects_a_path_outside_every_root() {
        let library_dir = TestDir::new("reject-library");
        let outside_dir = TestDir::new("reject-outside");
        let outside_path = outside_dir.path.join("track.wav");
        fs::write(&outside_path, b"fake-audio").unwrap();

        let roots = vec![library_dir.path.to_string_lossy().to_string()];
        let result = validate_path_within_roots(&outside_path, &roots);
        assert!(matches!(result, Err(Error::PathOutsideLibrary(_))));
    }

    #[test]
    fn update_track_metadata_writes_to_the_file_and_updates_the_db() {
        let dir = TestDir::new("update");
        let cache = dir.path.join("cache");
        let audio_path = dir.path.join("track.wav");
        fs::write(
            &audio_path,
            build_wav(
                Some(("Old Title", "Old Artist", "Old Album", "Old Genre")),
                0.2,
            ),
        )
        .unwrap();

        let db = Database::open_in_memory().unwrap();
        scan_root(&db, &cache, &dir.path).unwrap();
        let track_id = db.list_tracks_for_browse().unwrap()[0].id;

        let updated = update_track_metadata(&db, &cache, track_id, &no_artwork_update()).unwrap();

        assert_eq!(updated.title, "New Title");
        assert_eq!(updated.artist_name, Some("New Artist".to_string()));
        assert_eq!(updated.album_title, Some("New Album".to_string()));
        assert_eq!(updated.track_number, Some(3));
        assert_eq!(updated.year, Some(2024));

        // The file on disk must actually reflect the edit, not just the DB.
        let reread = crate::scan::metadata::read_metadata(&audio_path).unwrap();
        assert_eq!(reread.title, "New Title");
        assert_eq!(reread.artist, Some("New Artist".to_string()));
    }

    #[test]
    fn update_track_metadata_rejects_a_track_outside_configured_roots() {
        let dir = TestDir::new("outside-scan");
        let cache = dir.path.join("cache");
        let audio_path = dir.path.join("track.wav");
        fs::write(&audio_path, build_wav(None, 0.2)).unwrap();

        let db = Database::open_in_memory().unwrap();
        scan_root(&db, &cache, &dir.path).unwrap();
        let track_id = db.list_tracks_for_browse().unwrap()[0].id;

        // Simulates the library root having since been removed (spec
        // §37: a track's file must still be validated against the
        // *current* configured roots, not merely "some root once").
        db.remove_scan_root(&dir.path.to_string_lossy()).unwrap();

        let result = update_track_metadata(&db, &cache, track_id, &no_artwork_update());
        assert!(matches!(result, Err(Error::PathOutsideLibrary(_))));
    }

    #[test]
    fn update_track_metadata_can_replace_and_then_remove_artwork() {
        let dir = TestDir::new("artwork");
        let cache = dir.path.join("cache");
        let audio_path = dir.path.join("track.wav");
        fs::write(&audio_path, build_wav(None, 0.2)).unwrap();

        let db = Database::open_in_memory().unwrap();
        scan_root(&db, &cache, &dir.path).unwrap();
        let track_id = db.list_tracks_for_browse().unwrap()[0].id;

        let with_art = MetadataUpdate {
            artwork: ArtworkUpdate::Replace {
                data: b"fake-jpeg-bytes".to_vec(),
                extension: "jpg".to_string(),
            },
            ..no_artwork_update()
        };
        let updated = update_track_metadata(&db, &cache, track_id, &with_art).unwrap();
        assert!(updated.has_embedded_art);

        let without_art = MetadataUpdate {
            artwork: ArtworkUpdate::Remove,
            ..no_artwork_update()
        };
        let updated = update_track_metadata(&db, &cache, track_id, &without_art).unwrap();
        assert!(!updated.has_embedded_art);
    }
}
