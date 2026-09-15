//! Playback history.

use super::Database;
use crate::error::Result;
use rusqlite::params;

impl Database {
    pub fn record_played(&self, track_id: i64, played_at: i64) -> Result<()> {
        self.conn.execute(
            "INSERT INTO playback_history (track_id, played_at) VALUES (?1, ?2)",
            params![track_id, played_at],
        )?;
        Ok(())
    }

    /// Most recently played track ids, deduplicated (most recent play wins),
    /// newest first, capped at `limit`.
    pub fn recently_played_track_ids(&self, limit: i64) -> Result<Vec<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT track_id FROM playback_history h
             WHERE played_at = (
                 SELECT MAX(played_at) FROM playback_history WHERE track_id = h.track_id
             )
             GROUP BY track_id
             ORDER BY played_at DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |row| row.get(0))?;
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
    fn recently_played_is_deduplicated_and_ordered() {
        let db = Database::open_in_memory().unwrap();
        let a = insert_track(&db, "/a.mp3");
        let b = insert_track(&db, "/b.mp3");

        db.record_played(a, 1).unwrap();
        db.record_played(b, 2).unwrap();
        db.record_played(a, 3).unwrap(); // a played again, more recently

        assert_eq!(db.recently_played_track_ids(10).unwrap(), vec![a, b]);
    }

    #[test]
    fn recently_played_respects_limit() {
        let db = Database::open_in_memory().unwrap();
        let a = insert_track(&db, "/a.mp3");
        let b = insert_track(&db, "/b.mp3");
        db.record_played(a, 1).unwrap();
        db.record_played(b, 2).unwrap();

        assert_eq!(db.recently_played_track_ids(1).unwrap(), vec![b]);
    }
}
