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

    /// Returns the new `playlist_tracks` row's own id — callers need it to
    /// later reorder or remove this specific occurrence, since a track is
    /// allowed to appear in a playlist more than once (see
    /// `reorder_playlist`'s doc comment for why that rules out keying by
    /// `track_id`).
    pub fn add_track_to_playlist(&self, playlist_id: i64, track_id: i64) -> Result<i64> {
        let next_position: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(position) + 1, 0) FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )?;
        self.conn.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
            params![playlist_id, track_id, next_position],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Removes one occurrence of a track from a playlist, identified by
    /// its own `playlist_tracks.id` (from `playlist_track_rows`) rather
    /// than `track_id` — see `reorder_playlist`'s doc comment.
    pub fn remove_playlist_track(&self, playlist_track_id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM playlist_tracks WHERE id = ?1",
            params![playlist_track_id],
        )?;
        Ok(())
    }

    /// Track ids in a playlist, in position order. A track appearing
    /// twice in the same playlist appears twice here too, in whatever
    /// positions it actually occupies.
    pub fn playlist_track_ids(&self, playlist_id: i64) -> Result<Vec<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT track_id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position ASC",
        )?;
        let rows = stmt.query_map(params![playlist_id], |row| row.get(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    /// `(playlist_tracks.id, track_id)` pairs, in position order — the
    /// row id is what `reorder_playlist`/`remove_playlist_track` operate
    /// on, so a caller that needs to reorder or remove a specific
    /// occurrence (not just "the playlist's track ids") should use this
    /// instead of `playlist_track_ids`.
    pub fn playlist_track_rows(&self, playlist_id: i64) -> Result<Vec<(i64, i64)>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, track_id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position ASC",
        )?;
        let rows = stmt.query_map(params![playlist_id], |row| Ok((row.get(0)?, row.get(1)?)))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    /// Reorders a playlist's tracks to exactly `playlist_track_ids_in_order`
    /// (must be the same set of `playlist_tracks.id` row ids already in
    /// the playlist, from `playlist_track_rows`).
    ///
    /// Deliberately keyed by each row's own id rather than `track_id`:
    /// nothing in the schema prevents the same track appearing twice in
    /// one playlist, and keying by `track_id` would update *every*
    /// occurrence in one `UPDATE`/`DELETE` statement, making independent
    /// occurrences of a duplicated track impossible to reorder or remove
    /// individually.
    pub fn reorder_playlist(
        &self,
        playlist_id: i64,
        playlist_track_ids_in_order: &[i64],
    ) -> Result<()> {
        for (position, playlist_track_id) in playlist_track_ids_in_order.iter().enumerate() {
            self.conn.execute(
                "UPDATE playlist_tracks SET position = ?1
                 WHERE playlist_id = ?2 AND id = ?3",
                params![position as i64, playlist_id, playlist_track_id],
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

        let row_a = db.add_track_to_playlist(playlist.id, a).unwrap();
        let row_b = db.add_track_to_playlist(playlist.id, b).unwrap();
        let row_c = db.add_track_to_playlist(playlist.id, c).unwrap();
        assert_eq!(db.playlist_track_ids(playlist.id).unwrap(), vec![a, b, c]);

        db.reorder_playlist(playlist.id, &[row_c, row_a, row_b])
            .unwrap();
        assert_eq!(db.playlist_track_ids(playlist.id).unwrap(), vec![c, a, b]);

        db.remove_playlist_track(row_a).unwrap();
        assert_eq!(db.playlist_track_ids(playlist.id).unwrap(), vec![c, b]);
    }

    #[test]
    fn a_track_can_appear_twice_and_each_occurrence_is_independently_reorderable_and_removable() {
        // Regression test: reorder/remove previously keyed off `track_id`,
        // which the schema allows to repeat within one playlist — a
        // single UPDATE/DELETE would then hit every occurrence at once,
        // making independent occurrences impossible to manage.
        let db = Database::open_in_memory().unwrap();
        let playlist = db.create_playlist("Repeat", 0).unwrap();
        let a = insert_track(&db, "/a.mp3");
        let b = insert_track(&db, "/b.mp3");

        let first_a = db.add_track_to_playlist(playlist.id, a).unwrap();
        let row_b = db.add_track_to_playlist(playlist.id, b).unwrap();
        let second_a = db.add_track_to_playlist(playlist.id, a).unwrap();
        assert_ne!(first_a, second_a);
        assert_eq!(db.playlist_track_ids(playlist.id).unwrap(), vec![a, b, a]);

        db.reorder_playlist(playlist.id, &[second_a, row_b, first_a])
            .unwrap();
        assert_eq!(db.playlist_track_ids(playlist.id).unwrap(), vec![a, b, a]);
        assert_eq!(
            db.playlist_track_rows(playlist.id).unwrap(),
            vec![(second_a, a), (row_b, b), (first_a, a)]
        );

        db.remove_playlist_track(second_a).unwrap();
        assert_eq!(db.playlist_track_ids(playlist.id).unwrap(), vec![b, a]);
        assert_eq!(
            db.playlist_track_rows(playlist.id).unwrap(),
            vec![(row_b, b), (first_a, a)]
        );
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
