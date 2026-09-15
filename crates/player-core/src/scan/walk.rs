//! Iterative (non-recursive-call) directory walk for audio files.
//!
//! Hand-rolled rather than pulling in `walkdir`: the traversal this app
//! needs is simple (filter by extension, skip hidden entries), and doing
//! it with an explicit stack keeps the dependency list smaller while
//! still avoiding the two real hazards — unbounded call-stack recursion
//! on a deep tree, and symlink cycles (sidestepped by never following
//! symlinks at all, a documented v1 limitation).

use std::fs;
use std::path::{Path, PathBuf};

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "ogg", "opus", "m4a", "aac"];

pub fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            AUDIO_EXTENSIONS
                .iter()
                .any(|known| known.eq_ignore_ascii_case(ext))
        })
        .unwrap_or(false)
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with('.'))
        .unwrap_or(false)
}

/// Walks `root` for audio files. Directories that can't be read (missing
/// permissions, since-deleted) are skipped rather than aborting the
/// whole walk — a scan must survive a partially-unreadable library.
pub fn walk_audio_files(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut stack = vec![root.to_path_buf()];

    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if is_hidden(&path) {
                continue;
            }
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                stack.push(path);
            } else if file_type.is_file() && is_audio_file(&path) {
                found.push(path);
            }
        }
    }

    found
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;

    #[test]
    fn finds_audio_files_recursively_and_skips_others() {
        let dir = tempfile_dir();
        std::fs::create_dir_all(dir.join("Album")).unwrap();
        File::create(dir.join("Album/track.flac")).unwrap();
        File::create(dir.join("Album/cover.jpg")).unwrap();
        File::create(dir.join("readme.txt")).unwrap();

        let found = walk_audio_files(&dir);
        assert_eq!(found, vec![dir.join("Album/track.flac")]);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn skips_hidden_files_and_directories() {
        let dir = tempfile_dir();
        std::fs::create_dir_all(dir.join(".trash")).unwrap();
        File::create(dir.join(".trash/deleted.mp3")).unwrap();
        File::create(dir.join(".hidden.mp3")).unwrap();
        File::create(dir.join("visible.mp3")).unwrap();

        let found = walk_audio_files(&dir);
        assert_eq!(found, vec![dir.join("visible.mp3")]);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn is_audio_file_is_case_insensitive() {
        assert!(is_audio_file(Path::new("Track.FLAC")));
        assert!(is_audio_file(Path::new("track.Mp3")));
        assert!(!is_audio_file(Path::new("track.txt")));
        assert!(!is_audio_file(Path::new("no-extension")));
    }

    fn tempfile_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "amp-scan-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
}
