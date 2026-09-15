//! The persisted playback queue (survives app restart, per spec §22).

use super::Database;
use crate::error::Result;
use rusqlite::params;

impl Database {
    pub fn set_queue(&self, track_ids: &[i64]) -> Result<()> {
        self.conn.execute("DELETE FROM queue", [])?;
        for (position, track_id) in track_ids.iter().enumerate() {
            self.conn.execute(
                "INSERT INTO queue (track_id, position) VALUES (?1, ?2)",
                params![track_id, position as i64],
            )?;
        }
        Ok(())
    }

    pub fn get_queue(&self) -> Result<Vec<i64>> {
        let mut stmt = self
            .conn
            .prepare("SELECT track_id FROM queue ORDER BY position ASC")?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn clear_queue(&self) -> Result<()> {
        self.conn.execute("DELETE FROM queue", [])?;
        Ok(())
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
    fn set_and_get_queue_round_trips_order() {
        let db = Database::open_in_memory().unwrap();
        let a = insert_track(&db, "/a.mp3");
        let b = insert_track(&db, "/b.mp3");

        db.set_queue(&[b, a]).unwrap();
        assert_eq!(db.get_queue().unwrap(), vec![b, a]);
    }

    #[test]
    fn set_queue_replaces_previous_contents() {
        let db = Database::open_in_memory().unwrap();
        let a = insert_track(&db, "/a.mp3");
        let b = insert_track(&db, "/b.mp3");

        db.set_queue(&[a, b]).unwrap();
        db.set_queue(&[b]).unwrap();
        assert_eq!(db.get_queue().unwrap(), vec![b]);
    }

    #[test]
    fn clear_queue_empties_it() {
        let db = Database::open_in_memory().unwrap();
        let a = insert_track(&db, "/a.mp3");
        db.set_queue(&[a]).unwrap();
        db.clear_queue().unwrap();
        assert!(db.get_queue().unwrap().is_empty());
    }
}
