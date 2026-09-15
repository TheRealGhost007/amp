//! Tracks which library root folders exist and when each was last
//! scanned, so a rescan doesn't have to walk the whole library from
//! scratch every time (spec §22).

use super::Database;
use crate::error::Result;
use rusqlite::params;

impl Database {
    pub fn add_scan_root(&self, root_path: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO scan_state (root_path, last_scanned_at) VALUES (?1, NULL)
             ON CONFLICT(root_path) DO NOTHING",
            params![root_path],
        )?;
        Ok(())
    }

    pub fn remove_scan_root(&self, root_path: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM scan_state WHERE root_path = ?1",
            params![root_path],
        )?;
        Ok(())
    }

    pub fn list_scan_roots(&self) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT root_path FROM scan_state ORDER BY root_path")?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn mark_scan_root_scanned(&self, root_path: &str, scanned_at: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE scan_state SET last_scanned_at = ?1 WHERE root_path = ?2",
            params![scanned_at, root_path],
        )?;
        Ok(())
    }

    pub fn last_scanned_at(&self, root_path: &str) -> Result<Option<i64>> {
        self.conn
            .query_row(
                "SELECT last_scanned_at FROM scan_state WHERE root_path = ?1",
                params![root_path],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adding_a_root_twice_is_idempotent() {
        let db = Database::open_in_memory().unwrap();
        db.add_scan_root("/home/trg/Music").unwrap();
        db.add_scan_root("/home/trg/Music").unwrap();
        assert_eq!(
            db.list_scan_roots().unwrap(),
            vec!["/home/trg/Music".to_string()]
        );
    }

    #[test]
    fn marking_scanned_updates_the_timestamp() {
        let db = Database::open_in_memory().unwrap();
        db.add_scan_root("/home/trg/Music").unwrap();
        assert_eq!(db.last_scanned_at("/home/trg/Music").unwrap(), None);

        db.mark_scan_root_scanned("/home/trg/Music", 1_700_000_000)
            .unwrap();
        assert_eq!(
            db.last_scanned_at("/home/trg/Music").unwrap(),
            Some(1_700_000_000)
        );
    }

    #[test]
    fn removing_a_root_drops_it() {
        let db = Database::open_in_memory().unwrap();
        db.add_scan_root("/home/trg/Music").unwrap();
        db.remove_scan_root("/home/trg/Music").unwrap();
        assert!(db.list_scan_roots().unwrap().is_empty());
    }
}
