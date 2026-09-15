//! Row structs shared across `db` submodules and (eventually) serialized
//! straight to the frontend by `src-tauri` commands.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Artist {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Genre {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Album {
    pub id: i64,
    pub title: String,
    pub artist_id: Option<i64>,
    pub year: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Track {
    pub id: i64,
    pub path: String,
    pub title: String,
    pub artist_id: Option<i64>,
    pub album_id: Option<i64>,
    pub album_artist: Option<String>,
    pub genre_id: Option<i64>,
    pub track_number: Option<i64>,
    pub disc_number: Option<i64>,
    pub year: Option<i64>,
    pub duration_ms: i64,
    pub has_embedded_art: bool,
    pub mtime: i64,
    pub content_hash: Option<String>,
    pub added_at: i64,
}

/// Fields needed to insert a track — `id` and `added_at` are assigned by
/// the database layer, not the caller.
pub struct NewTrack {
    pub path: String,
    pub title: String,
    pub artist_id: Option<i64>,
    pub album_id: Option<i64>,
    pub album_artist: Option<String>,
    pub genre_id: Option<i64>,
    pub track_number: Option<i64>,
    pub disc_number: Option<i64>,
    pub year: Option<i64>,
    pub duration_ms: i64,
    pub has_embedded_art: bool,
    pub mtime: i64,
    pub content_hash: Option<String>,
}

/// Minimal per-track projection used by the scanner to diff the
/// filesystem against the database without paying to deserialize every
/// column of every row in a 50k-track library.
#[derive(Debug, Clone, PartialEq)]
pub struct ScanDiffRow {
    pub id: i64,
    pub path: String,
    pub mtime: i64,
    pub content_hash: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub artwork_path: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct QueueItem {
    pub id: i64,
    pub track_id: i64,
    pub position: i64,
}
