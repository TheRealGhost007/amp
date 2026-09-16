//! Desktop track-change notifications via `notify-rust`.
//!
//! Like `mpris`, the actual D-Bus round-trip (`org.freedesktop.Notifications`)
//! needs a live session bus, which isn't guaranteed in CI — verified
//! on-device instead (see ARCHITECTURE.md's Phase 11 section). The one
//! pure piece worth unit-testing is the subtitle line's formatting.

use crate::error::{Error, Result};
use std::path::Path;

/// A generic freedesktop icon-naming-spec name, used when a track has no
/// resolvable artwork so the notification still shows a music-shaped
/// icon rather than a blank/default one.
const FALLBACK_ICON: &str = "audio-x-generic";

pub struct TrackChangeNotification<'a> {
    pub title: &'a str,
    pub artist: Option<&'a str>,
    pub album: Option<&'a str>,
    pub artwork_path: Option<&'a Path>,
}

/// "Artist — Album", "Artist", "Album", or nothing — whichever of the
/// two pieces are actually known.
fn subtitle(artist: Option<&str>, album: Option<&str>) -> Option<String> {
    match (artist, album) {
        (Some(artist), Some(album)) => Some(format!("{artist} — {album}")),
        (Some(artist), None) => Some(artist.to_string()),
        (None, Some(album)) => Some(album.to_string()),
        (None, None) => None,
    }
}

pub async fn notify_track_change(info: TrackChangeNotification<'_>) -> Result<()> {
    let mut notification = notify_rust::Notification::new();
    notification.appname("Amp").summary(info.title);
    if let Some(body) = subtitle(info.artist, info.album) {
        notification.body(&body);
    }
    notification.icon(
        info.artwork_path
            .map(|p| p.display().to_string())
            .as_deref()
            .unwrap_or(FALLBACK_ICON),
    );

    notification
        .show_async()
        .await
        .map_err(|e| Error::Internal(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subtitle_joins_artist_and_album_when_both_are_known() {
        assert_eq!(
            subtitle(Some("Daft Punk"), Some("Discovery")),
            Some("Daft Punk — Discovery".to_string())
        );
    }

    #[test]
    fn subtitle_falls_back_to_whichever_one_piece_is_known() {
        assert_eq!(
            subtitle(Some("Daft Punk"), None),
            Some("Daft Punk".to_string())
        );
        assert_eq!(
            subtitle(None, Some("Discovery")),
            Some("Discovery".to_string())
        );
    }

    #[test]
    fn subtitle_is_none_when_neither_is_known() {
        assert_eq!(subtitle(None, None), None);
    }
}
