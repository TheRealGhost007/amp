//! Persistence layer: SQLite via `rusqlite`, migrated with
//! `rusqlite_migration`. Zero Tauri awareness — every function here is
//! exercised directly by `cargo test`.

mod schema;

pub mod favorites;
pub mod history;
pub mod library;
pub mod models;
pub mod playlists;
pub mod queue;
pub mod scan_state;
pub mod search;
pub mod settings;

use crate::error::Result;
use directories::ProjectDirs;
use rusqlite::Connection;
use std::path::{Path, PathBuf};

pub struct Database {
    pub(crate) conn: Connection,
}

impl Database {
    /// Opens (creating if needed) the database at `path`, applying any
    /// pending migrations.
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut conn = Connection::open(path)?;
        conn.pragma_update(None, "foreign_keys", true)?;
        schema::migrations().to_latest(&mut conn)?;
        Ok(Self { conn })
    }

    /// In-memory database for tests: same schema, no filesystem I/O.
    pub fn open_in_memory() -> Result<Self> {
        let mut conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", true)?;
        schema::migrations().to_latest(&mut conn)?;
        Ok(Self { conn })
    }

    /// The standard on-disk location under this platform's XDG data dir.
    pub fn default_path() -> Result<PathBuf> {
        let dirs = ProjectDirs::from("", "", "amp").ok_or(crate::error::Error::NoAppDirs)?;
        Ok(dirs.data_dir().join("library.sqlite3"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_in_memory_and_applies_migrations() {
        let db = Database::open_in_memory().unwrap();
        let table_count: i64 = db
            .conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        // 10 real tables + 2 FTS5 shadow tables (tracks_fts_data, tracks_fts_idx, ...)
        // are created by SQLite for the virtual table; just assert our tables exist.
        assert!(table_count >= 10);
    }

    #[test]
    fn migrating_twice_is_a_no_op() {
        let mut conn = Connection::open_in_memory().unwrap();
        schema::migrations().to_latest(&mut conn).unwrap();
        schema::migrations().to_latest(&mut conn).unwrap();
    }
}
