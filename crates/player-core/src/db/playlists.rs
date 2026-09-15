//! Playlists and their track ordering.

use super::models::Playlist;
use super::Database;
use crate::error::Result;
use rusqlite::{params, OptionalExtension};

impl Database {
    pub fn create_playlist(&self, name: &str, now: i64) -> Result<Playlist> {
        self.conn.execute(
            "INSERT INTO playlists (name, description, artwork_path, created_at, updated_at)
             VALUES (?1, NULL, NULL, ?2, ?2)",
            params![name, now],
        )?;
        let id = self.conn.last_insert_rowid();
        self.get_playlist(id)?
            .ok_or_else(|| crate::error::Error::Internal("inserted playlist vanished".into()))
    }

    pub fn get_playlist(&self, id: i64) -> Result<Option<Playlist>> {
        self.conn
            .query_row(
                "SELECT id, name, description, artwork_path, created_at, updated_at
                 FROM playlists WHERE id = ?1",
                params![id],
                Self::row_to_playlist,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_playlists(&self) -> Result<Vec<Playlist>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, description, artwork_path, created_at, updated_at
             FROM playlists ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], Self::row_to_playlist)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn rename_playlist(&self, id: i64, name: &str, now: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE playlists SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, now, id],
        )?;
        Ok(())
    }

    pub fn delete_playlist(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM playlists WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn add_track_to_playlist(&self, playlist_id: i64, track_id: i64) -> Result<()> {
        let next_position: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(position) + 1, 0) FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )?;
        self.conn.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
            params![playlist_id, track_id, next_position],
        )?;
        Ok(())
    }

    pub fn remove_track_from_playlist(&self, playlist_id: i64, track_id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
            params![playlist_id, track_id],
        )?;
        Ok(())
    }

    /// Track ids in a playlist, in position order.
    pub fn playlist_track_ids(&self, playlist_id: i64) -> Result<Vec<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT track_id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position ASC",
        )?;
        let rows = stmt.query_map(params![playlist_id], |row| row.get(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    /// Reorders a playlist's tracks to exactly `track_ids_in_order`
    /// (must be the same set of track ids already in the playlist).
    pub fn reorder_playlist(&self, playlist_id: i64, track_ids_in_order: &[i64]) -> Result<()> {
        for (position, track_id) in track_ids_in_order.iter().enumerate() {
            self.conn.execute(
                "UPDATE playlist_tracks SET position = ?1
                 WHERE playlist_id = ?2 AND track_id = ?3",
                params![position as i64, playlist_id, track_id],
            )?;
        }
        Ok(())
    }

    fn row_to_playlist(row: &rusqlite::Row) -> rusqlite::Result<Playlist> {
        Ok(Playlist {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            artwork_path: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::NewTrack;

    fn insert_track(db: &Database, path: &str) -> i64 {
        db.insert_track(
            &NewTrack {
                path: path.into(),
                title: path.into(),
                artist_id: None,
                album_id: None,
                album_artist: None,
                genre_id: None,
                track_number: None,
                disc_number: None,
                year: None,
                duration_ms: 1000,
                has_embedded_art: false,
                mtime: 0,
                content_hash: None,
            },
            0,
        )
        .unwrap()
        .id
    }

    #[test]
    fn create_rename_delete_playlist() {
        let db = Database::open_in_memory().unwrap();
        let playlist = db.create_playlist("Favorites Mix", 100).unwrap();
        db.rename_playlist(playlist.id, "Favorites Mix 2024", 200)
            .unwrap();
        let renamed = db.get_playlist(playlist.id).unwrap().unwrap();
        assert_eq!(renamed.name, "Favorites Mix 2024");

        db.delete_playlist(playlist.id).unwrap();
        assert!(db.get_playlist(playlist.id).unwrap().is_none());
    }

    #[test]
    fn add_reorder_and_remove_tracks() {
        let db = Database::open_in_memory().unwrap();
        let playlist = db.create_playlist("Road Trip", 0).unwrap();
        let a = insert_track(&db, "/a.mp3");
        let b = insert_track(&db, "/b.mp3");
        let c = insert_track(&db, "/c.mp3");

        db.add_track_to_playlist(playlist.id, a).unwrap();
        db.add_track_to_playlist(playlist.id, b).unwrap();
        db.add_track_to_playlist(playlist.id, c).unwrap();
        assert_eq!(db.playlist_track_ids(playlist.id).unwrap(), vec![a, b, c]);

        db.reorder_playlist(playlist.id, &[c, a, b]).unwrap();
        assert_eq!(db.playlist_track_ids(playlist.id).unwrap(), vec![c, a, b]);

        db.remove_track_from_playlist(playlist.id, a).unwrap();
        assert_eq!(db.playlist_track_ids(playlist.id).unwrap(), vec![c, b]);
    }

    #[test]
    fn deleting_playlist_cascades_to_playlist_tracks() {
        let db = Database::open_in_memory().unwrap();
        let playlist = db.create_playlist("Temp", 0).unwrap();
        let a = insert_track(&db, "/a.mp3");
        db.add_track_to_playlist(playlist.id, a).unwrap();

        db.delete_playlist(playlist.id).unwrap();

        let count: i64 = db
            .conn
            .query_row("SELECT count(*) FROM playlist_tracks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}
