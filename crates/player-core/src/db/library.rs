//! Artists, genres, albums, and tracks — the core library tables.

use super::models::{Album, Artist, Genre, NewTrack, Track};
use super::Database;
use crate::error::Result;
use rusqlite::{params, OptionalExtension};

impl Database {
    pub fn get_or_create_artist(&self, name: &str) -> Result<Artist> {
        self.conn.execute(
            "INSERT INTO artists (name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
            params![name],
        )?;
        self.conn
            .query_row(
                "SELECT id, name FROM artists WHERE name = ?1",
                params![name],
                |row| {
                    Ok(Artist {
                        id: row.get(0)?,
                        name: row.get(1)?,
                    })
                },
            )
            .map_err(Into::into)
    }

    pub fn get_or_create_genre(&self, name: &str) -> Result<Genre> {
        self.conn.execute(
            "INSERT INTO genres (name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
            params![name],
        )?;
        self.conn
            .query_row(
                "SELECT id, name FROM genres WHERE name = ?1",
                params![name],
                |row| {
                    Ok(Genre {
                        id: row.get(0)?,
                        name: row.get(1)?,
                    })
                },
            )
            .map_err(Into::into)
    }

    pub fn get_or_create_album(
        &self,
        title: &str,
        artist_id: Option<i64>,
        year: Option<i64>,
    ) -> Result<Album> {
        self.conn.execute(
            "INSERT INTO albums (title, artist_id, year) VALUES (?1, ?2, ?3)
             ON CONFLICT(title, artist_id) DO NOTHING",
            params![title, artist_id, year],
        )?;
        self.conn
            .query_row(
                "SELECT id, title, artist_id, year FROM albums
                 WHERE title = ?1 AND artist_id IS ?2",
                params![title, artist_id],
                Self::row_to_album,
            )
            .map_err(Into::into)
    }

    pub fn insert_track(&self, track: &NewTrack, added_at: i64) -> Result<Track> {
        self.conn.execute(
            "INSERT INTO tracks (
                path, title, artist_id, album_id, album_artist, genre_id,
                track_number, disc_number, year, duration_ms, has_embedded_art,
                mtime, content_hash, added_at
            ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![
                track.path,
                track.title,
                track.artist_id,
                track.album_id,
                track.album_artist,
                track.genre_id,
                track.track_number,
                track.disc_number,
                track.year,
                track.duration_ms,
                track.has_embedded_art,
                track.mtime,
                track.content_hash,
                added_at,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        self.get_track(id)?
            .ok_or_else(|| crate::error::Error::Internal("inserted track vanished".into()))
    }

    pub fn get_track(&self, id: i64) -> Result<Option<Track>> {
        self.conn
            .query_row(
                "SELECT id, path, title, artist_id, album_id, album_artist, genre_id,
                        track_number, disc_number, year, duration_ms, has_embedded_art,
                        mtime, content_hash, added_at
                 FROM tracks WHERE id = ?1",
                params![id],
                Self::row_to_track,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn get_track_by_path(&self, path: &str) -> Result<Option<Track>> {
        self.conn
            .query_row(
                "SELECT id, path, title, artist_id, album_id, album_artist, genre_id,
                        track_number, disc_number, year, duration_ms, has_embedded_art,
                        mtime, content_hash, added_at
                 FROM tracks WHERE path = ?1",
                params![path],
                Self::row_to_track,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_tracks(&self) -> Result<Vec<Track>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, path, title, artist_id, album_id, album_artist, genre_id,
                    track_number, disc_number, year, duration_ms, has_embedded_art,
                    mtime, content_hash, added_at
             FROM tracks ORDER BY added_at DESC",
        )?;
        let rows = stmt.query_map([], Self::row_to_track)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn delete_track(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM tracks WHERE id = ?1", params![id])?;
        Ok(())
    }

    fn row_to_track(row: &rusqlite::Row) -> rusqlite::Result<Track> {
        Ok(Track {
            id: row.get(0)?,
            path: row.get(1)?,
            title: row.get(2)?,
            artist_id: row.get(3)?,
            album_id: row.get(4)?,
            album_artist: row.get(5)?,
            genre_id: row.get(6)?,
            track_number: row.get(7)?,
            disc_number: row.get(8)?,
            year: row.get(9)?,
            duration_ms: row.get(10)?,
            has_embedded_art: row.get(11)?,
            mtime: row.get(12)?,
            content_hash: row.get(13)?,
            added_at: row.get(14)?,
        })
    }

    fn row_to_album(row: &rusqlite::Row) -> rusqlite::Result<Album> {
        Ok(Album {
            id: row.get(0)?,
            title: row.get(1)?,
            artist_id: row.get(2)?,
            year: row.get(3)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_track(path: &str) -> NewTrack {
        NewTrack {
            path: path.into(),
            title: "One More Time".into(),
            artist_id: None,
            album_id: None,
            album_artist: None,
            genre_id: None,
            track_number: Some(1),
            disc_number: Some(1),
            year: Some(2001),
            duration_ms: 320_000,
            has_embedded_art: true,
            mtime: 1_700_000_000,
            content_hash: Some("abc123".into()),
        }
    }

    #[test]
    fn get_or_create_artist_is_idempotent() {
        let db = Database::open_in_memory().unwrap();
        let a1 = db.get_or_create_artist("Daft Punk").unwrap();
        let a2 = db.get_or_create_artist("Daft Punk").unwrap();
        assert_eq!(a1.id, a2.id);
    }

    #[test]
    fn get_or_create_album_scopes_by_artist() {
        let db = Database::open_in_memory().unwrap();
        let artist = db.get_or_create_artist("Daft Punk").unwrap();
        let other = db.get_or_create_artist("Tycho").unwrap();
        let album_a = db
            .get_or_create_album("Discovery", Some(artist.id), Some(2001))
            .unwrap();
        let album_b = db
            .get_or_create_album("Discovery", Some(other.id), Some(1999))
            .unwrap();
        assert_ne!(album_a.id, album_b.id);
    }

    #[test]
    fn insert_and_fetch_track_round_trips() {
        let db = Database::open_in_memory().unwrap();
        let inserted = db
            .insert_track(&sample_track("/music/one.flac"), 1_700_000_100)
            .unwrap();
        let fetched = db.get_track(inserted.id).unwrap().unwrap();
        assert_eq!(fetched.title, "One More Time");
        assert_eq!(fetched.duration_ms, 320_000);
        assert!(fetched.has_embedded_art);
    }

    #[test]
    fn duplicate_path_is_rejected() {
        let db = Database::open_in_memory().unwrap();
        db.insert_track(&sample_track("/music/one.flac"), 1)
            .unwrap();
        let err = db.insert_track(&sample_track("/music/one.flac"), 2);
        assert!(err.is_err());
    }

    #[test]
    fn deleting_a_track_removes_it() {
        let db = Database::open_in_memory().unwrap();
        let track = db
            .insert_track(&sample_track("/music/one.flac"), 1)
            .unwrap();
        db.delete_track(track.id).unwrap();
        assert!(db.get_track(track.id).unwrap().is_none());
    }

    #[test]
    fn list_tracks_orders_newest_first() {
        let db = Database::open_in_memory().unwrap();
        db.insert_track(&sample_track("/music/a.flac"), 1).unwrap();
        db.insert_track(&sample_track("/music/b.flac"), 2).unwrap();
        let tracks = db.list_tracks().unwrap();
        assert_eq!(tracks[0].path, "/music/b.flac");
        assert_eq!(tracks[1].path, "/music/a.flac");
    }
}
