//! The persisted upcoming-playback queue (survives app restart, per spec
//! §22). Deliberately separate from `audio-engine`'s `Player::next`: this
//! table is the real, ordered "what plays after the current track" list;
//! `next` is just the single look-ahead slot the frontend keeps synced to
//! this queue's head so the backend can preload it for gapless/crossfade.
//! The currently-playing track itself is never a row here — it lives in
//! `Player`/the frontend's playback store, not the queue.

use super::models::QueueItem;
use super::Database;
use crate::error::Result;
use rusqlite::params;

impl Database {
    /// Appends a track to the end of the queue, returning the new row's
    /// own id — needed because a track may legitimately appear in the
    /// queue more than once (see `reorder_queue`'s doc comment).
    pub fn add_to_queue(&self, track_id: i64) -> Result<i64> {
        let next_position: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(position) + 1, 0) FROM queue",
            [],
            |row| row.get(0),
        )?;
        self.conn.execute(
            "INSERT INTO queue (track_id, position) VALUES (?1, ?2)",
            params![track_id, next_position],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Inserts a track at the very front of the queue (spec's "Play
    /// Next"), shifting every existing row down one position.
    pub fn insert_next_in_queue(&self, track_id: i64) -> Result<i64> {
        self.conn
            .execute("UPDATE queue SET position = position + 1", [])?;
        self.conn.execute(
            "INSERT INTO queue (track_id, position) VALUES (?1, 0)",
            params![track_id],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Queue rows in position order — `id` is each row's own identity,
    /// distinct from `track_id` since a track can appear more than once.
    pub fn list_queue_items(&self) -> Result<Vec<QueueItem>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, track_id, position FROM queue ORDER BY position ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok(QueueItem {
                id: row.get(0)?,
                track_id: row.get(1)?,
                position: row.get(2)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    /// Removes one occurrence of a track from the queue, identified by
    /// its own `queue.id` (from `list_queue_items`) rather than
    /// `track_id`.
    pub fn remove_queue_item(&self, queue_item_id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM queue WHERE id = ?1", params![queue_item_id])?;
        Ok(())
    }

    /// Reorders the queue to exactly `queue_item_ids_in_order` (must be
    /// the same set of row ids already in the queue, from
    /// `list_queue_items`) — keyed by row id, not `track_id`, for the
    /// same reason as `Database::reorder_playlist`.
    pub fn reorder_queue(&self, queue_item_ids_in_order: &[i64]) -> Result<()> {
        for (position, queue_item_id) in queue_item_ids_in_order.iter().enumerate() {
            self.conn.execute(
                "UPDATE queue SET position = ?1 WHERE id = ?2",
                params![position as i64, queue_item_id],
            )?;
        }
        Ok(())
    }

    pub fn clear_queue(&self) -> Result<()> {
        self.conn.execute("DELETE FROM queue", [])?;
        Ok(())
    }

    /// Empties the queue and repopulates it with `track_ids` in order —
    /// backs "play this track and queue the rest of the list" (Library,
    /// Album/Artist detail, Playlist detail, Favorites, Recently Played
    /// all queue whatever comes after the clicked track in that same
    /// list, replacing whatever was queued before).
    pub fn replace_queue(&self, track_ids: &[i64]) -> Result<()> {
        self.conn.execute("DELETE FROM queue", [])?;
        for (position, track_id) in track_ids.iter().enumerate() {
            self.conn.execute(
                "INSERT INTO queue (track_id, position) VALUES (?1, ?2)",
                params![track_id, position as i64],
            )?;
        }
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

    fn track_ids(items: &[QueueItem]) -> Vec<i64> {
        items.iter().map(|i| i.track_id).collect()
    }

    #[test]
    fn add_to_queue_appends_in_order() {
        let db = Database::open_in_memory().unwrap();
        let a = insert_track(&db, "/a.mp3");
        let b = insert_track(&db, "/b.mp3");

        db.add_to_queue(a).unwrap();
        db.add_to_queue(b).unwrap();

        assert_eq!(track_ids(&db.list_queue_items().unwrap()), vec![a, b]);
    }

    #[test]
    fn insert_next_puts_track_at_the_front() {
        let db = Database::open_in_memory().unwrap();
        let a = insert_track(&db, "/a.mp3");
        let b = insert_track(&db, "/b.mp3");
        let c = insert_track(&db, "/c.mp3");

        db.add_to_queue(a).unwrap();
        db.add_to_queue(b).unwrap();
        db.insert_next_in_queue(c).unwrap();

        assert_eq!(track_ids(&db.list_queue_items().unwrap()), vec![c, a, b]);
    }

    #[test]
    fn remove_and_reorder_use_row_identity_not_track_id() {
        let db = Database::open_in_memory().unwrap();
        let a = insert_track(&db, "/a.mp3");
        let b = insert_track(&db, "/b.mp3");

        let row_a = db.add_to_queue(a).unwrap();
        let row_b = db.add_to_queue(b).unwrap();
        let row_a2 = db.add_to_queue(a).unwrap(); // same track queued twice
        assert_ne!(row_a, row_a2);

        db.reorder_queue(&[row_a2, row_b, row_a]).unwrap();
        assert_eq!(track_ids(&db.list_queue_items().unwrap()), vec![a, b, a]);

        db.remove_queue_item(row_a2).unwrap();
        let remaining = db.list_queue_items().unwrap();
        assert_eq!(track_ids(&remaining), vec![b, a]);
        assert_eq!(
            remaining[1].id, row_a,
            "the other `a` occurrence must survive"
        );
    }

    #[test]
    fn clear_queue_empties_it() {
        let db = Database::open_in_memory().unwrap();
        let a = insert_track(&db, "/a.mp3");
        db.add_to_queue(a).unwrap();
        db.clear_queue().unwrap();
        assert!(db.list_queue_items().unwrap().is_empty());
    }

    #[test]
    fn replace_queue_discards_the_old_queue_and_sets_a_new_one_in_order() {
        let db = Database::open_in_memory().unwrap();
        let a = insert_track(&db, "/a.mp3");
        let b = insert_track(&db, "/b.mp3");
        let c = insert_track(&db, "/c.mp3");

        db.add_to_queue(a).unwrap();
        db.replace_queue(&[c, b]).unwrap();

        assert_eq!(track_ids(&db.list_queue_items().unwrap()), vec![c, b]);
    }

    #[test]
    fn replace_queue_with_an_empty_list_clears_it() {
        let db = Database::open_in_memory().unwrap();
        let a = insert_track(&db, "/a.mp3");
        db.add_to_queue(a).unwrap();

        db.replace_queue(&[]).unwrap();

        assert!(db.list_queue_items().unwrap().is_empty());
    }
}
