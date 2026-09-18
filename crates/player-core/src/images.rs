//! Reads a user-picked local image file (custom background, spec §24's
//! "custom backgrounds" ask) and returns it as a `data:` URL the
//! WebView can use directly as a CSS `background-image`.
//!
//! Deliberately not routed through Tauri's asset protocol: that would
//! mean enabling a new Cargo feature, a new `tauri.conf.json` block, and
//! granting the WebView a persistent, growing set of servable file
//! paths (`asset_protocol_scope().allow_file`) for every image a user
//! ever picks. A one-shot read-bytes-and-return command has no such
//! standing grant — nothing is ever servable to the WebView beyond the
//! literal bytes returned from this one call, for this one file, at the
//! moment the user explicitly picked it via the native file dialog.

use crate::error::{Error, Result};
use base64::Engine;
use std::path::Path;

/// Past this, base64-inflate the whole file into one WebView-owned
/// string starts being a real memory/perf concern for a value that's
/// just a decorative background — a user photo or wallpaper is
/// comfortably under this either way.
const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;

fn mime_type_for(path: &Path) -> Result<&'static str> {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => Ok("image/png"),
        Some("jpg") | Some("jpeg") => Ok("image/jpeg"),
        Some("webp") => Ok("image/webp"),
        Some("gif") => Ok("image/gif"),
        Some("bmp") => Ok("image/bmp"),
        _ => Err(Error::Internal(
            "unsupported image type (expected png, jpg, webp, gif, or bmp)".into(),
        )),
    }
}

pub fn read_as_data_url(path: &Path) -> Result<String> {
    let mime = mime_type_for(path)?;
    let metadata = std::fs::metadata(path)?;
    if metadata.len() > MAX_IMAGE_BYTES {
        return Err(Error::Internal(format!(
            "image is too large ({} MB, max {} MB)",
            metadata.len() / 1024 / 1024,
            MAX_IMAGE_BYTES / 1024 / 1024
        )));
    }
    let bytes = std::fs::read(path)?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("amp-images-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn reads_a_png_as_a_data_url() {
        let dir = temp_dir("png");
        let path = dir.join("wallpaper.png");
        fs::write(&path, b"fake-png-bytes").unwrap();

        let url = read_as_data_url(&path).unwrap();

        assert!(url.starts_with("data:image/png;base64,"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn rejects_an_unsupported_extension() {
        let dir = temp_dir("unsupported");
        let path = dir.join("wallpaper.svg");
        fs::write(&path, b"<svg></svg>").unwrap();

        let err = read_as_data_url(&path).unwrap_err();

        assert_eq!(err.code(), "INTERNAL_ERROR");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn rejects_a_file_over_the_size_limit() {
        let dir = temp_dir("oversized");
        let path = dir.join("huge.png");
        // Sparse file: fast to create, no need to actually write 21MB.
        let file = fs::File::create(&path).unwrap();
        file.set_len(MAX_IMAGE_BYTES + 1).unwrap();

        let err = read_as_data_url(&path).unwrap_err();

        assert_eq!(err.code(), "INTERNAL_ERROR");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_missing_file_is_an_io_error() {
        let dir = temp_dir("missing");
        let path = dir.join("nonexistent.png");

        let err = read_as_data_url(&path).unwrap_err();

        assert_eq!(err.code(), "IO_ERROR");
        fs::remove_dir_all(&dir).unwrap();
    }
}
