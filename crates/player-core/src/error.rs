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
