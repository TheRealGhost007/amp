//! Full-text search over the library via SQLite FTS5. Kept in the
//! database layer (not shipped to the frontend as a JS library) so
//! search stays fast at 50k+ tracks — see spec §7/§19.

use super::Database;
use crate::error::Result;
use rusqlite::params;

impl Database {
    /// (Re)indexes one track's searchable text. Called by the scanner
    /// (Phase 3) after every insert/update; idempotent.
    pub fn index_track_for_search(
        &self,
        track_id: i64,
        title: &str,
        artist: &str,
        album: &str,
        genre: &str,
    ) -> Result<()> {
        self.remove_track_from_search_index(track_id)?;
        self.conn.execute(
            "INSERT INTO tracks_fts (rowid, title, artist, album, genre)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![track_id, title, artist, album, genre],
        )?;
        Ok(())
    }

    /// `track_id` is this table's rowid (see `schema.rs`), so this is an
    /// indexed point delete, not a table scan, at any library size.
    pub fn remove_track_from_search_index(&self, track_id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM tracks_fts WHERE rowid = ?1", params![track_id])?;
        Ok(())
    }

    /// Track ids ranked by relevance to `query`, best match first.
    /// User input is treated as untrusted: every whitespace-separated
    /// token becomes a quoted, escaped FTS5 string literal with a
    /// trailing prefix wildcard — arbitrary punctuation in `query` can
    /// never produce an FTS5 syntax error or reach SQL as anything but a
    /// bound parameter.
    pub fn search_tracks(&self, query: &str, limit: i64) -> Result<Vec<i64>> {
        let fts_query = to_fts5_prefix_query(query);
        if fts_query.is_empty() {
            return Ok(Vec::new());
        }
        let mut stmt = self.conn.prepare(
            "SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH ?1
             ORDER BY rank LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![fts_query, limit], |row| row.get(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }
}

fn to_fts5_prefix_query(query: &str) -> String {
    query
        .split_whitespace()
        .map(|token| format!("\"{}\"*", token.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_track_by_prefix() {
        let db = Database::open_in_memory().unwrap();
        db.index_track_for_search(1, "One More Time", "Daft Punk", "Discovery", "Electronic")
            .unwrap();

        assert_eq!(db.search_tracks("daft", 10).unwrap(), vec![1]);
        assert_eq!(db.search_tracks("disc", 10).unwrap(), vec![1]);
    }

    #[test]
    fn reindexing_replaces_old_entry() {
        let db = Database::open_in_memory().unwrap();
        db.index_track_for_search(1, "Old Title", "Artist", "Album", "Genre")
            .unwrap();
        db.index_track_for_search(1, "New Title", "Artist", "Album", "Genre")
            .unwrap();

        assert!(db.search_tracks("old", 10).unwrap().is_empty());
        assert_eq!(db.search_tracks("new", 10).unwrap(), vec![1]);
    }

    #[test]
    fn removing_from_index_stops_matching() {
        let db = Database::open_in_memory().unwrap();
        db.index_track_for_search(1, "One More Time", "Daft Punk", "Discovery", "Electronic")
            .unwrap();
        db.remove_track_from_search_index(1).unwrap();
        assert!(db.search_tracks("daft", 10).unwrap().is_empty());
    }

    #[test]
    fn malformed_query_syntax_never_errors() {
        let db = Database::open_in_memory().unwrap();
        db.index_track_for_search(1, "One More Time", "Daft Punk", "Discovery", "Electronic")
            .unwrap();

        for hostile in ["\"", "AND OR NOT", "*", "((", "col:", ""] {
            assert!(
                db.search_tracks(hostile, 10).is_ok(),
                "query {hostile:?} should not error"
            );
        }
    }
}
