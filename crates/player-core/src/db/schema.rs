//! Migration definitions. Each entry is a forward-only SQL migration
//! applied in order by `rusqlite_migration` — never edit an already
//! shipped migration, add a new one instead.

use rusqlite_migration::{Migrations, M};

pub fn migrations() -> Migrations<'static> {
    Migrations::new(vec![M::up(
        r#"
        CREATE TABLE artists (
            id   INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE genres (
            id   INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE albums (
            id        INTEGER PRIMARY KEY,
            title     TEXT NOT NULL,
            artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
            year      INTEGER,
            UNIQUE(title, artist_id)
        );
        CREATE INDEX idx_albums_artist_id ON albums(artist_id);

        CREATE TABLE tracks (
            id               INTEGER PRIMARY KEY,
            path             TEXT NOT NULL UNIQUE,
            title            TEXT NOT NULL,
            artist_id        INTEGER REFERENCES artists(id) ON DELETE SET NULL,
            album_id         INTEGER REFERENCES albums(id) ON DELETE SET NULL,
            album_artist     TEXT,
            genre_id         INTEGER REFERENCES genres(id) ON DELETE SET NULL,
            track_number     INTEGER,
            disc_number      INTEGER,
            year             INTEGER,
            duration_ms      INTEGER NOT NULL DEFAULT 0,
            has_embedded_art INTEGER NOT NULL DEFAULT 0,
            mtime            INTEGER NOT NULL,
            content_hash     TEXT,
            added_at         INTEGER NOT NULL
        );
        CREATE INDEX idx_tracks_artist_id ON tracks(artist_id);
        CREATE INDEX idx_tracks_album_id ON tracks(album_id);
        CREATE INDEX idx_tracks_genre_id ON tracks(genre_id);
        CREATE INDEX idx_tracks_added_at ON tracks(added_at);

        CREATE VIRTUAL TABLE tracks_fts USING fts5(
            title,
            artist,
            album,
            genre,
            track_id UNINDEXED
        );

        CREATE TABLE playlists (
            id           INTEGER PRIMARY KEY,
            name         TEXT NOT NULL,
            description  TEXT,
            artwork_path TEXT,
            created_at   INTEGER NOT NULL,
            updated_at   INTEGER NOT NULL
        );

        CREATE TABLE playlist_tracks (
            id          INTEGER PRIMARY KEY,
            playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
            track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            position    INTEGER NOT NULL
        );
        CREATE INDEX idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id);

        CREATE TABLE favorites (
            id       INTEGER PRIMARY KEY,
            track_id INTEGER NOT NULL UNIQUE REFERENCES tracks(id) ON DELETE CASCADE,
            added_at INTEGER NOT NULL
        );

        CREATE TABLE playback_history (
            id        INTEGER PRIMARY KEY,
            track_id  INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            played_at INTEGER NOT NULL
        );
        CREATE INDEX idx_playback_history_played_at ON playback_history(played_at);

        CREATE TABLE queue (
            id       INTEGER PRIMARY KEY,
            track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            position INTEGER NOT NULL
        );

        CREATE TABLE settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE scan_state (
            id              INTEGER PRIMARY KEY,
            root_path       TEXT NOT NULL UNIQUE,
            last_scanned_at INTEGER
        );
        "#,
    )])
}
