//! Crate-wide error type for `linux-integration`.
//!
//! Kept minimal in Phase 0; extended in Phase 11 once MPRIS, notification,
//! and media-key wiring are real.

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum Error {
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
