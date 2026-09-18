//! Artists, genres, albums, and tracks — the core library tables.

use super::models::{Album, Artist, Genre, NewTrack, ScanDiffRow, Track};
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
        // `UNIQUE(title, artist_id)` gives `ON CONFLICT` nothing to
        // conflict against when `artist_id` is NULL — SQL treats NULL as
        // distinct from NULL for uniqueness purposes, so every
        // untagged-artist album (common for compilations/"Various
        // Artists" folders) would insert a brand-new duplicate row on
        // every call instead of reusing the first one, splitting one
        // real album across multiple rows in Browse. Checking for an
        // existing row explicitly first (`IS`, NULL-safe unlike `=`)
        // works correctly for both the NULL and non-NULL cases, and is
        // race-free in practice since every caller in this app
        // serializes access to one `Database` behind a single mutex.
        if let Some(existing) = self
            .conn
            .query_row(
                "SELECT id, title, artist_id, year FROM albums
                 WHERE title = ?1 AND artist_id IS ?2",
                params![title, artist_id],
                Self::row_to_album,
            )
            .optional()?
        {
            // The first-scanned track's year used to stick forever, even
            // after the user corrected it via the metadata editor — this
            // function only ever inserted, never updated, so a later
            // scan/edit's differing `year` was silently discarded and
            // Browse kept showing the stale original value permanently.
            // Only a real, different value overwrites; never blank out
            // an already-known year with an absent one (e.g. a track
            // missing its own year tag scanned after one that had it).
            if let Some(new_year) = year {
                if existing.year != Some(new_year) {
                    self.conn.execute(
                        "UPDATE albums SET year = ?1 WHERE id = ?2",
                        params![new_year, existing.id],
                    )?;
                    return Ok(Album {
                        year: Some(new_year),
                        ..existing
                    });
                }
            }
            return Ok(existing);
        }
        self.conn.execute(
            "INSERT INTO albums (title, artist_id, year) VALUES (?1, ?2, ?3)",
            params![title, artist_id, year],
        )?;
        self.conn
            .query_row(
                "SELECT id, title, artist_id, year FROM albums WHERE id = ?1",
                params![self.conn.last_insert_rowid()],
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

    /// Full re-write of a track's metadata fields, used when the scanner
    /// finds an on-disk file whose mtime changed. Path and id are
    /// untouched — see `rename_track_path` for path changes.
    pub fn update_track(&self, id: i64, track: &NewTrack) -> Result<()> {
        // Captured before the write so a retag that moves this track off
        // an artist/album/genre can tell whether that old one is now
        // orphaned — see `gc_orphaned_taxonomy`.
        let previous = self.get_track(id)?;
        self.conn.execute(
            "UPDATE tracks SET
                title = ?1, artist_id = ?2, album_id = ?3, album_artist = ?4,
                genre_id = ?5, track_number = ?6, disc_number = ?7, year = ?8,
                duration_ms = ?9, has_embedded_art = ?10, mtime = ?11,
                content_hash = ?12
             WHERE id = ?13",
            params![
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
                id,
            ],
        )?;
        if let Some(previous) = previous {
            self.gc_orphaned_taxonomy(previous.artist_id, previous.album_id, previous.genre_id)?;
        }
        Ok(())
    }

    /// Removes an artist/album/genre row if nothing references it
    /// anymore — called after anything that could leave one newly
    /// orphaned (`update_track` retagging a track away from it, or
    /// `delete_track` removing its last track). Without this, artists/
    /// albums/genres accumulated permanently as zero-track "ghost"
    /// entries in Browse every time a track was retagged or removed;
    /// safe to call even when nothing actually changed (a still-current
    /// id is still referenced by the row that was just written, so the
    /// `NOT EXISTS` check simply finds nothing to remove).
    fn gc_orphaned_taxonomy(
        &self,
        artist_id: Option<i64>,
        album_id: Option<i64>,
        genre_id: Option<i64>,
    ) -> Result<()> {
        if let Some(id) = artist_id {
            self.conn.execute(
                "DELETE FROM artists WHERE id = ?1
                 AND NOT EXISTS (SELECT 1 FROM tracks WHERE artist_id = ?1)",
                params![id],
            )?;
        }
        if let Some(id) = album_id {
            self.conn.execute(
                "DELETE FROM albums WHERE id = ?1
                 AND NOT EXISTS (SELECT 1 FROM tracks WHERE album_id = ?1)",
                params![id],
            )?;
        }
        if let Some(id) = genre_id {
            self.conn.execute(
                "DELETE FROM genres WHERE id = ?1
                 AND NOT EXISTS (SELECT 1 FROM tracks WHERE genre_id = ?1)",
                params![id],
            )?;
        }
        Ok(())
    }

    /// Repoints an existing track row at a new filesystem path — used by
    /// the scanner's rename detection so favorites/playlists/history tied
    /// to this track survive a file being moved or renamed, rather than
    /// looking like a delete-then-add.
    pub fn rename_track_path(&self, id: i64, new_path: &str, new_mtime: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE tracks SET path = ?1, mtime = ?2 WHERE id = ?3",
            params![new_path, new_mtime, id],
        )?;
        Ok(())
    }

    /// Minimal projection of every track whose path starts with
    /// `path_prefix`, for the scanner to diff against the filesystem.
    pub fn tracks_for_scan_diff(&self, path_prefix: &str) -> Result<Vec<ScanDiffRow>> {
        // A bare string prefix (`LIKE '<prefix>%'`) also matches any
        // sibling path that merely starts with the same characters —
        // root "/home/user/Music" would incorrectly match every track
        // under an unrelated "/home/user/MusicOld/...". Requiring the
        // character right after the root to be a path separator (or the
        // path to equal the root exactly) makes this a real
        // path-component boundary match, not a plain string prefix, so
        // a rescan (or `remove_scan_root_and_its_tracks`) of one root
        // can never see — or delete — an unrelated root's tracks just
        // because their paths happen to share a prefix.
        let trimmed = path_prefix.trim_end_matches('/');
        let escaped = trimmed.replace('%', "\\%").replace('_', "\\_");
        let like_pattern = format!("{escaped}/%");
        let mut stmt = self.conn.prepare(
            "SELECT id, path, mtime, content_hash FROM tracks
             WHERE path = ?1 OR path LIKE ?2 ESCAPE '\\'",
        )?;
        let rows = stmt.query_map(params![trimmed, like_pattern], |row| {
            Ok(ScanDiffRow {
                id: row.get(0)?,
                path: row.get(1)?,
                mtime: row.get(2)?,
                content_hash: row.get(3)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
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
        let previous = self.get_track(id)?;
        self.conn
            .execute("DELETE FROM tracks WHERE id = ?1", params![id])?;
        if let Some(previous) = previous {
            self.gc_orphaned_taxonomy(previous.artist_id, previous.album_id, previous.genre_id)?;
        }
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

    fn row_exists(db: &Database, table: &str, id: i64) -> bool {
        db.conn
            .query_row(
                &format!("SELECT COUNT(*) FROM {table} WHERE id = ?1"),
                params![id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap()
            > 0
    }

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
    fn get_or_create_album_is_idempotent_with_no_artist() {
        // SQL treats NULL as distinct from NULL for UNIQUE-constraint
        // purposes, so `ON CONFLICT(title, artist_id) DO NOTHING` never
        // fires when `artist_id` is None — a real, common case for
        // compilations/"Various Artists" scans with no artist tag.
        // Without the explicit existence check, this created a second,
        // duplicate "Various" album row instead of reusing the first.
        let db = Database::open_in_memory().unwrap();
        let first = db.get_or_create_album("Various", None, Some(2001)).unwrap();
        let second = db.get_or_create_album("Various", None, Some(2001)).unwrap();
        assert_eq!(first.id, second.id);
        let count: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM albums", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn get_or_create_album_updates_a_differing_year_on_an_existing_row() {
        // Regression test: this function used to only ever insert, never
        // update — the first-scanned track's year stuck forever, even
        // after the user corrected it via the metadata editor (which
        // re-derives the album through this same function on save).
        let db = Database::open_in_memory().unwrap();
        let artist = db.get_or_create_artist("Daft Punk").unwrap();
        let first = db
            .get_or_create_album("Discovery", Some(artist.id), Some(2001))
            .unwrap();
        assert_eq!(first.year, Some(2001));

        let updated = db
            .get_or_create_album("Discovery", Some(artist.id), Some(1997))
            .unwrap();

        assert_eq!(updated.id, first.id, "must still be the same album row");
        assert_eq!(updated.year, Some(1997));
        let stored: Option<i64> = db
            .conn
            .query_row(
                "SELECT year FROM albums WHERE id = ?1",
                params![first.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stored, Some(1997));
    }

    #[test]
    fn get_or_create_album_never_blanks_out_a_known_year_with_an_absent_one() {
        let db = Database::open_in_memory().unwrap();
        let first = db
            .get_or_create_album("Discovery", None, Some(2001))
            .unwrap();

        // A later scan of a track missing its own year tag must not wipe
        // out the year the album already has.
        let again = db.get_or_create_album("Discovery", None, None).unwrap();

        assert_eq!(again.id, first.id);
        assert_eq!(again.year, Some(2001));
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

    #[test]
    fn update_track_overwrites_metadata_but_keeps_path_and_id() {
        let db = Database::open_in_memory().unwrap();
        let track = db
            .insert_track(&sample_track("/music/one.flac"), 1)
            .unwrap();

        let mut updated = sample_track("/music/one.flac");
        updated.title = "One More Time (Remix)".into();
        updated.duration_ms = 400_000;
        db.update_track(track.id, &updated).unwrap();

        let fetched = db.get_track(track.id).unwrap().unwrap();
        assert_eq!(fetched.id, track.id);
        assert_eq!(fetched.path, "/music/one.flac");
        assert_eq!(fetched.title, "One More Time (Remix)");
        assert_eq!(fetched.duration_ms, 400_000);
    }

    #[test]
    fn rename_track_path_preserves_id() {
        let db = Database::open_in_memory().unwrap();
        let track = db
            .insert_track(&sample_track("/music/old-name.flac"), 1)
            .unwrap();
        db.rename_track_path(track.id, "/music/new-name.flac", 2)
            .unwrap();

        assert!(db
            .get_track_by_path("/music/old-name.flac")
            .unwrap()
            .is_none());
        let renamed = db
            .get_track_by_path("/music/new-name.flac")
            .unwrap()
            .unwrap();
        assert_eq!(renamed.id, track.id);
        assert_eq!(renamed.mtime, 2);
    }

    #[test]
    fn update_track_removes_an_artist_album_genre_left_with_no_tracks() {
        let db = Database::open_in_memory().unwrap();
        let old_artist = db.get_or_create_artist("Old Artist").unwrap();
        let old_album = db
            .get_or_create_album("Old Album", Some(old_artist.id), None)
            .unwrap();
        let old_genre = db.get_or_create_genre("Old Genre").unwrap();
        let mut track = sample_track("/music/one.flac");
        track.artist_id = Some(old_artist.id);
        track.album_id = Some(old_album.id);
        track.genre_id = Some(old_genre.id);
        let inserted = db.insert_track(&track, 1).unwrap();

        let new_artist = db.get_or_create_artist("New Artist").unwrap();
        let new_album = db
            .get_or_create_album("New Album", Some(new_artist.id), None)
            .unwrap();
        let new_genre = db.get_or_create_genre("New Genre").unwrap();
        let mut retagged = sample_track("/music/one.flac");
        retagged.artist_id = Some(new_artist.id);
        retagged.album_id = Some(new_album.id);
        retagged.genre_id = Some(new_genre.id);
        db.update_track(inserted.id, &retagged).unwrap();

        // Retagging this, the only track under the old artist/album/
        // genre, must not leave them behind as permanent zero-track
        // "ghost" rows that Browse would otherwise show forever.
        assert!(!row_exists(&db, "artists", old_artist.id));
        assert!(!row_exists(&db, "albums", old_album.id));
        assert!(!row_exists(&db, "genres", old_genre.id));
    }

    #[test]
    fn update_track_keeps_an_artist_album_genre_still_used_by_another_track() {
        let db = Database::open_in_memory().unwrap();
        let artist = db.get_or_create_artist("Shared Artist").unwrap();
        let album = db
            .get_or_create_album("Shared Album", Some(artist.id), None)
            .unwrap();
        let genre = db.get_or_create_genre("Shared Genre").unwrap();
        let mut track_a = sample_track("/music/a.flac");
        track_a.artist_id = Some(artist.id);
        track_a.album_id = Some(album.id);
        track_a.genre_id = Some(genre.id);
        db.insert_track(&track_a, 1).unwrap();
        let mut track_b = sample_track("/music/b.flac");
        track_b.artist_id = Some(artist.id);
        track_b.album_id = Some(album.id);
        track_b.genre_id = Some(genre.id);
        let inserted_b = db.insert_track(&track_b, 2).unwrap();

        // Retagging track B away must not remove artist/album/genre rows
        // that track A still legitimately references.
        let mut retagged = sample_track("/music/b.flac");
        retagged.artist_id = None;
        retagged.album_id = None;
        retagged.genre_id = None;
        db.update_track(inserted_b.id, &retagged).unwrap();

        assert!(row_exists(&db, "artists", artist.id));
        assert!(row_exists(&db, "albums", album.id));
        assert!(row_exists(&db, "genres", genre.id));
    }

    #[test]
    fn delete_track_removes_an_artist_album_genre_left_with_no_tracks() {
        let db = Database::open_in_memory().unwrap();
        let artist = db.get_or_create_artist("Solo Artist").unwrap();
        let album = db
            .get_or_create_album("Solo Album", Some(artist.id), None)
            .unwrap();
        let genre = db.get_or_create_genre("Solo Genre").unwrap();
        let mut track = sample_track("/music/one.flac");
        track.artist_id = Some(artist.id);
        track.album_id = Some(album.id);
        track.genre_id = Some(genre.id);
        let inserted = db.insert_track(&track, 1).unwrap();

        db.delete_track(inserted.id).unwrap();

        assert!(!row_exists(&db, "artists", artist.id));
        assert!(!row_exists(&db, "albums", album.id));
        assert!(!row_exists(&db, "genres", genre.id));
    }

    #[test]
    fn tracks_for_scan_diff_filters_by_path_prefix() {
        let db = Database::open_in_memory().unwrap();
        db.insert_track(&sample_track("/music/albums/a.flac"), 1)
            .unwrap();
        db.insert_track(&sample_track("/podcasts/ep1.mp3"), 2)
            .unwrap();

        let rows = db.tracks_for_scan_diff("/music/").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].path, "/music/albums/a.flac");
    }

    #[test]
    fn tracks_for_scan_diff_escapes_sql_like_wildcards_in_prefix() {
        let db = Database::open_in_memory().unwrap();
        db.insert_track(&sample_track("/music/100%_mix/a.flac"), 1)
            .unwrap();
        db.insert_track(&sample_track("/music/100X_mix/b.flac"), 2)
            .unwrap();

        // A literal "%" and "_" in the root path must not act as SQL
        // LIKE wildcards, or an unrelated "100X_mix" folder would match
        // a "100%_mix" prefix.
        let rows = db.tracks_for_scan_diff("/music/100%_mix/").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].path, "/music/100%_mix/a.flac");
    }

    #[test]
    fn tracks_for_scan_diff_does_not_match_a_sibling_root_sharing_a_string_prefix() {
        let db = Database::open_in_memory().unwrap();
        db.insert_track(&sample_track("/home/user/Music/a.flac"), 1)
            .unwrap();
        db.insert_track(&sample_track("/home/user/MusicOld/b.flac"), 2)
            .unwrap();

        // "/home/user/Music" is a plain string prefix of
        // "/home/user/MusicOld/b.flac" but not a real ancestor directory
        // of it — a bare `LIKE '<prefix>%'` would incorrectly match both,
        // which would make a rescan (or a scan-root removal) of the
        // former destroy the latter's tracks too.
        let rows = db.tracks_for_scan_diff("/home/user/Music").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].path, "/home/user/Music/a.flac");
    }

    #[test]
    fn tracks_for_scan_diff_matches_a_track_whose_path_is_exactly_the_root() {
        let db = Database::open_in_memory().unwrap();
        db.insert_track(&sample_track("/music/single-file.flac"), 1)
            .unwrap();

        let rows = db.tracks_for_scan_diff("/music/single-file.flac").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].path, "/music/single-file.flac");
    }
}
