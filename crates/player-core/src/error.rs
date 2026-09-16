//! Crate-wide error type for `player-core`.
//!
//! Kept minimal in Phase 0 and extended as scanning/DB/search land (Phases
//! 2-3). Mirrors the `code` + `message` + `details` wire shape used across
//! this workspace's sibling projects so `src-tauri` can wrap it uniformly.

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("migration error: {0}")]
    Migration(#[from] rusqlite_migration::Error),

    #[error("could not resolve application directories for this platform")]
    NoAppDirs,

    #[error("{0}")]
    NotFound(String),

    /// A file operation (currently: metadata editing) targeted a path
    /// outside every configured library root — spec §37: metadata and
    /// filenames are untrusted input, and file writes must never escape
    /// the folders the user explicitly added to their library. Kept
    /// distinct from `Internal` so this rejection is identifiable by
    /// its own error code rather than looking like a generic failure.
    #[error("path is outside the configured library folders: {0}")]
    PathOutsideLibrary(String),

    #[error("{0}")]
    Internal(String),
}

#[derive(Debug, Serialize)]
pub struct ErrorPayload {
    pub code: &'static str,
    pub message: String,
    pub details: Option<String>,
}

impl Error {
    pub fn code(&self) -> &'static str {
        match self {
            Error::Io(_) => "IO_ERROR",
            Error::Database(_) => "DATABASE_ERROR",
            Error::Migration(_) => "MIGRATION_ERROR",
            Error::NoAppDirs => "NO_APP_DIRS",
            Error::NotFound(_) => "NOT_FOUND",
            Error::PathOutsideLibrary(_) => "PATH_OUTSIDE_LIBRARY",
            Error::Internal(_) => "INTERNAL_ERROR",
        }
    }
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        ErrorPayload {
            code: self.code(),
            message: self.to_string(),
            details: None,
        }
        .serialize(serializer)
    }
}

pub type Result<T> = std::result::Result<T, Error>;
