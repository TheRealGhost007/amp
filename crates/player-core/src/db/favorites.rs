//! Favorited tracks.

use super::Database;
use crate::error::Result;
use rusqlite::params;

impl Database {
    pub fn add_favorite(&self, track_id: i64, now: i64) -> Result<()> {
        self.conn.execute(
            "INSERT INTO favorites (track_id, added_at) VALUES (?1, ?2)
             ON CONFLICT(track_id) DO NOTHING",
            params![track_id, now],
        )?;
        Ok(())
    }

    pub fn remove_favorite(&self, track_id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM favorites WHERE track_id = ?1",
            params![track_id],
        )?;
        Ok(())
    }

    pub fn is_favorite(&self, track_id: i64) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT count(*) FROM favorites WHERE track_id = ?1",
            params![track_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// Favorite track ids, most recently favorited first.
    pub fn list_favorite_track_ids(&self) -> Result<Vec<i64>> {
        let mut stmt = self
            .conn
            .prepare("SELECT track_id FROM favorites ORDER BY added_at DESC")?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
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
    fn favoriting_is_idempotent_and_reversible() {
        let db = Database::open_in_memory().unwrap();
        let track = insert_track(&db, "/a.mp3");

        assert!(!db.is_favorite(track).unwrap());
        db.add_favorite(track, 1).unwrap();
        db.add_favorite(track, 2).unwrap();
        assert!(db.is_favorite(track).unwrap());
        assert_eq!(db.list_favorite_track_ids().unwrap(), vec![track]);

        db.remove_favorite(track).unwrap();
        assert!(!db.is_favorite(track).unwrap());
    }

    #[test]
    fn deleting_track_removes_its_favorite() {
        let db = Database::open_in_memory().unwrap();
        let track = insert_track(&db, "/a.mp3");
        db.add_favorite(track, 1).unwrap();

        db.delete_track(track).unwrap();

        assert!(db.list_favorite_track_ids().unwrap().is_empty());
    }
}
