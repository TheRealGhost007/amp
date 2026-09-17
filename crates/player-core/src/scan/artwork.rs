//! Artwork resolution: embedded tag art takes priority over folder art
//! (`cover.jpg`, `folder.png`, ...), and whichever is found is cached to
//! disk under a stable key. A track with neither source is left with no
//! cache file — the frontend's `Artwork` component (Phase 1) generates a
//! deterministic placeholder in that case, so "no art" is never a broken
//! image, just a different, equally intentional visual.

use super::metadata::EmbeddedArt;
use std::fs;
use std::path::{Path, PathBuf};

const FOLDER_ART_NAMES: &[&str] = &["cover", "folder", "album", "front"];
const FOLDER_ART_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png"];

/// Looks for a conventionally-named artwork file in `audio_path`'s
/// directory. Matches case-insensitively since filesystems that store
/// music are frequently populated by tools that don't agree on case.
pub fn find_folder_art(audio_path: &Path) -> Option<PathBuf> {
    let dir = audio_path.parent()?;
    let entries = fs::read_dir(dir).ok()?;

    for entry in entries.flatten() {
        let path = entry.path();
        let stem = path.file_stem().and_then(|s| s.to_str());
        let ext = path.extension().and_then(|s| s.to_str());
        let (Some(stem), Some(ext)) = (stem, ext) else {
            continue;
        };
        let name_matches = FOLDER_ART_NAMES
            .iter()
            .any(|n| n.eq_ignore_ascii_case(stem));
        let ext_matches = FOLDER_ART_EXTENSIONS
            .iter()
            .any(|e| e.eq_ignore_ascii_case(ext));
        if name_matches && ext_matches {
            return Some(path);
        }
    }
    None
}

/// Writes `data` to `<cache_dir>/<key>.<extension>`, creating the cache
/// directory if needed, and returns the written path.
///
/// Known limitation: if a track's art source later changes to a
/// different image format under the same `key`, the old cached file is
/// left behind rather than cleaned up — acceptable for now since cache
/// dirs are periodically clearable from Settings (spec §23 Advanced).
pub fn cache_artwork(
    cache_dir: &Path,
    key: &str,
    data: &[u8],
    extension: &str,
) -> std::io::Result<PathBuf> {
    fs::create_dir_all(cache_dir)?;
    // Same reasoning as the library database's own directory (spec
    // §37) — album art reveals what's in a user's library, low
    // sensitivity but still not something another local account on a
    // shared machine should be able to browse.
    crate::db::restrict_to_owner_only(cache_dir, 0o700);
    let path = cache_dir.join(format!("{key}.{extension}"));
    fs::write(&path, data)?;
    Ok(path)
}

/// Resolves and caches artwork for one track: embedded art first, then
/// folder art, then nothing. Returns the cached file path, if any.
pub fn resolve_and_cache_artwork(
    cache_dir: &Path,
    key: &str,
    audio_path: &Path,
    embedded: Option<&EmbeddedArt>,
) -> Option<PathBuf> {
    if let Some(art) = embedded {
        return cache_artwork(cache_dir, key, &art.data, &art.extension).ok();
    }

    let folder_art_path = find_folder_art(audio_path)?;
    let extension = folder_art_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg")
        .to_string();
    let data = fs::read(&folder_art_path).ok()?;
    cache_artwork(cache_dir, key, &data, &extension).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("amp-artwork-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn finds_folder_art_case_insensitively() {
        let dir = temp_dir("folder-art");
        fs::write(dir.join("Cover.JPG"), b"fake-jpeg-bytes").unwrap();
        let audio_path = dir.join("track.flac");
        fs::write(&audio_path, b"fake-audio").unwrap();

        let found = find_folder_art(&audio_path).unwrap();
        assert_eq!(found, dir.join("Cover.JPG"));

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn returns_none_when_no_folder_art_present() {
        let dir = temp_dir("no-art");
        let audio_path = dir.join("track.flac");
        fs::write(&audio_path, b"fake-audio").unwrap();

        assert!(find_folder_art(&audio_path).is_none());

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn embedded_art_takes_priority_over_folder_art() {
        let dir = temp_dir("priority");
        fs::write(dir.join("cover.jpg"), b"folder-art-bytes").unwrap();
        let audio_path = dir.join("track.flac");
        fs::write(&audio_path, b"fake-audio").unwrap();
        let cache_dir = dir.join("cache");

        let embedded = EmbeddedArt {
            data: b"embedded-bytes".to_vec(),
            extension: "png".into(),
        };
        let cached =
            resolve_and_cache_artwork(&cache_dir, "track-1", &audio_path, Some(&embedded)).unwrap();

        assert_eq!(fs::read(&cached).unwrap(), b"embedded-bytes");
        assert_eq!(cached.extension().unwrap(), "png");

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn falls_back_to_folder_art_when_no_embedded_art() {
        let dir = temp_dir("fallback");
        fs::write(dir.join("folder.png"), b"folder-art-bytes").unwrap();
        let audio_path = dir.join("track.flac");
        fs::write(&audio_path, b"fake-audio").unwrap();
        let cache_dir = dir.join("cache");

        let cached = resolve_and_cache_artwork(&cache_dir, "track-2", &audio_path, None).unwrap();

        assert_eq!(fs::read(&cached).unwrap(), b"folder-art-bytes");

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn no_art_source_resolves_to_none() {
        let dir = temp_dir("none");
        let audio_path = dir.join("track.flac");
        fs::write(&audio_path, b"fake-audio").unwrap();
        let cache_dir = dir.join("cache");

        assert!(resolve_and_cache_artwork(&cache_dir, "track-3", &audio_path, None).is_none());

        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn cache_artwork_restricts_the_cache_directory_to_owner_only() {
        use std::os::unix::fs::PermissionsExt;

        let dir = temp_dir("permissions");
        let cache_dir = dir.join("cache");

        cache_artwork(&cache_dir, "track-1", b"fake-jpeg-bytes", "jpg").unwrap();

        let mode = fs::metadata(&cache_dir).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o700, "artwork cache directory must be owner-only");

        fs::remove_dir_all(&dir).unwrap();
    }
}
