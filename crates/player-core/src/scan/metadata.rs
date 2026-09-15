//! `lofty`-based tag extraction. Every failure here is returned as an
//! `Err(String)` for the caller to log and skip — this module must never
//! panic or let one malformed file abort a library scan (spec §5).

use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::PictureType;
use lofty::tag::{Accessor, ItemKey};
use std::path::Path;

pub struct EmbeddedArt {
    pub data: Vec<u8>,
    /// File extension without a leading dot (e.g. "jpg"), defaulted to
    /// "bin" when the tag doesn't specify a recognizable MIME type.
    pub extension: String,
}

pub struct TrackMetadata {
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub genre: Option<String>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<i32>,
    pub duration_ms: i64,
    pub embedded_art: Option<EmbeddedArt>,
}

/// Reads whatever metadata is available for `path`. Missing individual
/// fields (no title, no artist, ...) are not an error — only a file lofty
/// cannot parse at all is. A missing title falls back to the filename so
/// every track always has something displayable.
pub fn read_metadata(path: &Path) -> Result<TrackMetadata, String> {
    let tagged_file = lofty::read_from_path(path).map_err(|e| e.to_string())?;
    let properties = tagged_file.properties();
    let duration_ms = properties.duration().as_millis() as i64;

    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());

    let title = tag
        .and_then(|t| t.title())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| fallback_title(path));

    let artist = non_empty(tag.and_then(|t| t.artist()).map(|s| s.to_string()));
    let album = non_empty(tag.and_then(|t| t.album()).map(|s| s.to_string()));
    let genre = non_empty(tag.and_then(|t| t.genre()).map(|s| s.to_string()));
    let album_artist = non_empty(
        tag.and_then(|t| t.get_string(ItemKey::AlbumArtist))
            .map(|s| s.to_string()),
    );

    let track_number = tag.and_then(|t| t.track());
    let disc_number = tag.and_then(|t| t.disk());
    let year = tag.and_then(|t| t.date()).map(|d| d.year as i32);

    let embedded_art = tag.and_then(extract_cover_art);

    Ok(TrackMetadata {
        title,
        artist,
        album,
        album_artist,
        genre,
        track_number,
        disc_number,
        year,
        duration_ms,
        embedded_art,
    })
}

fn extract_cover_art(tag: &lofty::tag::Tag) -> Option<EmbeddedArt> {
    let pictures = tag.pictures();
    let picture = pictures
        .iter()
        .find(|p| p.pic_type() == PictureType::CoverFront)
        .or_else(|| pictures.first())?;

    let extension = picture
        .mime_type()
        .and_then(|m| m.ext())
        .unwrap_or("bin")
        .to_string();

    Some(EmbeddedArt {
        data: picture.data().to_vec(),
        extension,
    })
}

fn fallback_title(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "Unknown Title".to_string())
}

fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unreadable_file_returns_an_error_not_a_panic() {
        let dir = std::env::temp_dir().join(format!("amp-meta-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let bogus = dir.join("not-really-audio.mp3");
        std::fs::write(&bogus, b"this is not an mp3 file at all").unwrap();

        let result = read_metadata(&bogus);
        assert!(result.is_err());

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn fallback_title_uses_filename_stem() {
        assert_eq!(
            fallback_title(Path::new("/music/One More Time.flac")),
            "One More Time"
        );
        assert_eq!(fallback_title(Path::new("track")), "track");
    }

    #[test]
    fn non_empty_filters_blank_and_whitespace_only_strings() {
        assert_eq!(non_empty(Some("  ".to_string())), None);
        assert_eq!(non_empty(Some("".to_string())), None);
        assert_eq!(
            non_empty(Some(" Daft Punk ".to_string())),
            Some("Daft Punk".to_string())
        );
        assert_eq!(non_empty(None), None);
    }
}
