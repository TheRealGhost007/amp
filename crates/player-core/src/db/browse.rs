//! Read queries for the library browsing views (spec §6/§19): every
//! query here returns the *whole* result set in one call, joined and
//! display-ready. Virtualization (rendering only the visible rows) is
//! the frontend's job, not this layer's — fetching 50k lightweight rows
//! once is cheap; re-fetching per scroll position or per sort change
//! would not be.

use super::models::{
    AlbumSummary, ArtistSummary, PlaylistSummary, PlaylistTrackItem, QueueTrackItem, TrackListItem,
};
use super::Database;
use crate::error::Result;
use std::collections::HashMap;

const TRACK_LIST_ITEM_COLUMNS: &str = "
    t.id, t.path, t.title, ar.name, al.title, g.name,
    t.track_number, t.disc_number, t.duration_ms, t.year,
    t.has_embedded_art, t.added_at";

impl Database {
    pub fn list_tracks_for_browse(&self) -> Result<Vec<TrackListItem>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {TRACK_LIST_ITEM_COLUMNS}
             FROM tracks t
             LEFT JOIN artists ar ON ar.id = t.artist_id
             LEFT JOIN albums al ON al.id = t.album_id
             LEFT JOIN genres g ON g.id = t.genre_id
             ORDER BY t.title COLLATE NOCASE"
        ))?;
        let rows = stmt.query_map([], Self::row_to_track_list_item)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn list_albums_for_browse(&self) -> Result<Vec<AlbumSummary>> {
        let mut stmt = self.conn.prepare(
            "SELECT al.id, al.title, ar.name, al.year, COUNT(t.id)
             FROM albums al
             LEFT JOIN artists ar ON ar.id = al.artist_id
             LEFT JOIN tracks t ON t.album_id = al.id
             GROUP BY al.id
             ORDER BY al.title COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(AlbumSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                artist_name: row.get(2)?,
                year: row.get(3)?,
                track_count: row.get(4)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn list_artists_for_browse(&self) -> Result<Vec<ArtistSummary>> {
        let mut stmt = self.conn.prepare(
            "SELECT ar.id, ar.name,
                    COUNT(DISTINCT al.id), COUNT(DISTINCT t.id)
             FROM artists ar
             LEFT JOIN albums al ON al.artist_id = ar.id
             LEFT JOIN tracks t ON t.artist_id = ar.id
             GROUP BY ar.id
             ORDER BY ar.name COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ArtistSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                album_count: row.get(2)?,
                track_count: row.get(3)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    /// Full-text search, joined back to display-ready rows and returned
    /// in relevance order (the `IN (...)` clause SQLite would use here
    /// does not preserve that order, so results are re-sorted in Rust
    /// against the ranked id list from [`Database::search_tracks`]).
    pub fn search_tracks_for_browse(&self, query: &str, limit: i64) -> Result<Vec<TrackListItem>> {
        let ranked_ids = self.search_tracks(query, limit)?;
        if ranked_ids.is_empty() {
            return Ok(Vec::new());
        }

        let placeholders = ranked_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT {TRACK_LIST_ITEM_COLUMNS}
             FROM tracks t
             LEFT JOIN artists ar ON ar.id = t.artist_id
             LEFT JOIN albums al ON al.id = t.album_id
             LEFT JOIN genres g ON g.id = t.genre_id
             WHERE t.id IN ({placeholders})"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> = ranked_ids
            .iter()
            .map(|id| id as &dyn rusqlite::ToSql)
            .collect();
        let rows = stmt.query_map(params.as_slice(), Self::row_to_track_list_item)?;
        let by_id: HashMap<i64, TrackListItem> = rows
            .collect::<rusqlite::Result<Vec<_>>>()?
            .into_iter()
            .map(|item| (item.id, item))
            .collect();

        Ok(ranked_ids
            .into_iter()
            .filter_map(|id| by_id.get(&id).cloned())
            .collect())
    }

    /// The queue, joined to display-ready track fields, in position
    /// order — `id` in each item is the `queue` row's own identity.
    pub fn list_queue_for_browse(&self) -> Result<Vec<QueueTrackItem>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT q.id, {TRACK_LIST_ITEM_COLUMNS}
             FROM queue q
             JOIN tracks t ON t.id = q.track_id
             LEFT JOIN artists ar ON ar.id = t.artist_id
             LEFT JOIN albums al ON al.id = t.album_id
             LEFT JOIN genres g ON g.id = t.genre_id
             ORDER BY q.position ASC"
        ))?;
        let rows = stmt.query_map([], |row| {
            Ok(QueueTrackItem {
                id: row.get(0)?,
                track: Self::row_to_track_list_item_offset(row, 1)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    /// Every playlist with its track count, newest-updated first.
    pub fn list_playlists_for_browse(&self) -> Result<Vec<PlaylistSummary>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.name, p.description, COUNT(pt.id)
             FROM playlists p
             LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
             GROUP BY p.id
             ORDER BY p.updated_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(PlaylistSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                track_count: row.get(3)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    /// One playlist's tracks, joined to display-ready fields, in position
    /// order — `id` in each item is the `playlist_tracks` row's own
    /// identity.
    pub fn list_playlist_tracks_for_browse(
        &self,
        playlist_id: i64,
    ) -> Result<Vec<PlaylistTrackItem>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT pt.id, {TRACK_LIST_ITEM_COLUMNS}
             FROM playlist_tracks pt
             JOIN tracks t ON t.id = pt.track_id
             LEFT JOIN artists ar ON ar.id = t.artist_id
             LEFT JOIN albums al ON al.id = t.album_id
             LEFT JOIN genres g ON g.id = t.genre_id
             WHERE pt.playlist_id = ?1
             ORDER BY pt.position ASC"
        ))?;
        let rows = stmt.query_map(rusqlite::params![playlist_id], |row| {
            Ok(PlaylistTrackItem {
                id: row.get(0)?,
                track: Self::row_to_track_list_item_offset(row, 1)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    fn row_to_track_list_item(row: &rusqlite::Row) -> rusqlite::Result<TrackListItem> {
        Self::row_to_track_list_item_offset(row, 0)
    }

    /// Same as `row_to_track_list_item`, but the `TRACK_LIST_ITEM_COLUMNS`
    /// block starts at column `offset` instead of 0 — used when a query
    /// selects an extra leading column (e.g. a `queue`/`playlist_tracks`
    /// row id) ahead of the track columns.
    fn row_to_track_list_item_offset(
        row: &rusqlite::Row,
        offset: usize,
    ) -> rusqlite::Result<TrackListItem> {
        Ok(TrackListItem {
            id: row.get(offset)?,
            path: row.get(offset + 1)?,
            title: row.get(offset + 2)?,
            artist_name: row.get(offset + 3)?,
            album_title: row.get(offset + 4)?,
            genre_name: row.get(offset + 5)?,
            track_number: row.get(offset + 6)?,
            disc_number: row.get(offset + 7)?,
            duration_ms: row.get(offset + 8)?,
            year: row.get(offset + 9)?,
            has_embedded_art: row.get(offset + 10)?,
            added_at: row.get(offset + 11)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::NewTrack;

    fn insert_full_track(db: &Database, path: &str, title: &str, artist: &str, album: &str) -> i64 {
        let artist_row = db.get_or_create_artist(artist).unwrap();
        let album_row = db
            .get_or_create_album(album, Some(artist_row.id), Some(2001))
            .unwrap();
        let genre_row = db.get_or_create_genre("Electronic").unwrap();
        let track = db
            .insert_track(
                &NewTrack {
                    path: path.into(),
                    title: title.into(),
                    artist_id: Some(artist_row.id),
                    album_id: Some(album_row.id),
                    album_artist: Some(artist.into()),
                    genre_id: Some(genre_row.id),
                    track_number: Some(1),
                    disc_number: Some(1),
                    year: Some(2001),
                    duration_ms: 200_000,
                    has_embedded_art: false,
                    mtime: 0,
                    content_hash: None,
                },
                0,
            )
            .unwrap();
        db.index_track_for_search(track.id, title, artist, album, "Electronic")
            .unwrap();
        track.id
    }

    #[test]
    fn list_tracks_for_browse_joins_names_and_sorts_by_title() {
        let db = Database::open_in_memory().unwrap();
        insert_full_track(&db, "/b.flac", "Zebra", "Daft Punk", "Discovery");
        insert_full_track(&db, "/a.flac", "Aardvark", "Daft Punk", "Discovery");

        let tracks = db.list_tracks_for_browse().unwrap();
        assert_eq!(tracks.len(), 2);
        assert_eq!(tracks[0].title, "Aardvark");
        assert_eq!(tracks[0].path, "/a.flac");
        assert_eq!(tracks[0].artist_name, Some("Daft Punk".to_string()));
        assert_eq!(tracks[0].album_title, Some("Discovery".to_string()));
        assert_eq!(tracks[1].title, "Zebra");
    }

    #[test]
    fn list_albums_for_browse_counts_tracks() {
        let db = Database::open_in_memory().unwrap();
        insert_full_track(&db, "/a.flac", "One", "Daft Punk", "Discovery");
        insert_full_track(&db, "/b.flac", "Two", "Daft Punk", "Discovery");

        let albums = db.list_albums_for_browse().unwrap();
        assert_eq!(albums.len(), 1);
        assert_eq!(albums[0].title, "Discovery");
        assert_eq!(albums[0].track_count, 2);
        assert_eq!(albums[0].artist_name, Some("Daft Punk".to_string()));
    }

    #[test]
    fn list_artists_for_browse_counts_albums_and_tracks() {
        let db = Database::open_in_memory().unwrap();
        insert_full_track(&db, "/a.flac", "One", "Daft Punk", "Discovery");
        insert_full_track(&db, "/b.flac", "Two", "Daft Punk", "Homework");

        let artists = db.list_artists_for_browse().unwrap();
        assert_eq!(artists.len(), 1);
        assert_eq!(artists[0].name, "Daft Punk");
        assert_eq!(artists[0].album_count, 2);
        assert_eq!(artists[0].track_count, 2);
    }

    #[test]
    fn search_tracks_for_browse_preserves_relevance_order() {
        let db = Database::open_in_memory().unwrap();
        let exact_id = insert_full_track(&db, "/a.flac", "Daft Punk Anthem", "Daft Punk", "X");
        let looser_id = insert_full_track(&db, "/b.flac", "Something Else", "Daft Punk", "Y");

        let results = db.search_tracks_for_browse("daft", 10).unwrap();
        let ids: Vec<i64> = results.iter().map(|t| t.id).collect();
        assert!(ids.contains(&exact_id));
        assert!(ids.contains(&looser_id));
    }

    #[test]
    fn search_tracks_for_browse_with_no_matches_returns_empty() {
        let db = Database::open_in_memory().unwrap();
        insert_full_track(&db, "/a.flac", "One", "Daft Punk", "Discovery");
        assert!(db
            .search_tracks_for_browse("zzz-nonexistent", 10)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn list_queue_for_browse_joins_track_fields_in_position_order() {
        let db = Database::open_in_memory().unwrap();
        let a = insert_full_track(&db, "/a.flac", "Aardvark", "Daft Punk", "Discovery");
        let b = insert_full_track(&db, "/b.flac", "Zebra", "Daft Punk", "Discovery");

        let row_b = db.add_to_queue(b).unwrap();
        let row_a = db.add_to_queue(a).unwrap();

        let items = db.list_queue_for_browse().unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id, row_b);
        assert_eq!(items[0].track.title, "Zebra");
        assert_eq!(items[0].track.artist_name, Some("Daft Punk".to_string()));
        assert_eq!(items[1].id, row_a);
        assert_eq!(items[1].track.title, "Aardvark");
    }

    #[test]
    fn list_playlists_for_browse_counts_tracks_and_carries_description() {
        let db = Database::open_in_memory().unwrap();
        let playlist = db.create_playlist("Road Trip", 100).unwrap();
        db.rename_playlist(playlist.id, "Road Trip", 100).unwrap();
        db.set_playlist_description(playlist.id, Some("Summer 2026"), 200)
            .unwrap();
        let a = insert_full_track(&db, "/a.flac", "One", "Daft Punk", "Discovery");
        db.add_track_to_playlist(playlist.id, a).unwrap();

        let playlists = db.list_playlists_for_browse().unwrap();
        assert_eq!(playlists.len(), 1);
        assert_eq!(playlists[0].name, "Road Trip");
        assert_eq!(playlists[0].description, Some("Summer 2026".to_string()));
        assert_eq!(playlists[0].track_count, 1);
    }

    #[test]
    fn list_playlist_tracks_for_browse_joins_track_fields_in_position_order() {
        let db = Database::open_in_memory().unwrap();
        let playlist = db.create_playlist("Mix", 0).unwrap();
        let a = insert_full_track(&db, "/a.flac", "Aardvark", "Daft Punk", "Discovery");
        let b = insert_full_track(&db, "/b.flac", "Zebra", "Daft Punk", "Discovery");

        let row_a = db.add_track_to_playlist(playlist.id, a).unwrap();
        let row_b = db.add_track_to_playlist(playlist.id, b).unwrap();

        let items = db.list_playlist_tracks_for_browse(playlist.id).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id, row_a);
        assert_eq!(items[0].track.title, "Aardvark");
        assert_eq!(items[1].id, row_b);
        assert_eq!(items[1].track.title, "Zebra");
    }
}
