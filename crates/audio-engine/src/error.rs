//! Crate-wide error type for `audio-engine`.
//!
//! Kept minimal in Phase 0; extended in Phase 4 once GStreamer pipeline
//! construction, device enumeration, and decode errors are real.

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("audio pipeline error: {0}")]
    Pipeline(String),

    #[error("no such audio device: {0}")]
    DeviceNotFound(String),

    #[error("unsupported media: {0}")]
    Unsupported(String),

    /// The audio backend never initialized (e.g. GStreamer/PipeWire
    /// unavailable at startup) — distinct from `Pipeline`, which is a
    /// runtime failure of an otherwise-working backend. `src-tauri`
    /// surfaces this instead of crashing the whole app (spec §27).
    #[error("audio backend unavailable: {0}")]
    Unavailable(String),

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
            Error::Pipeline(_) => "PIPELINE_ERROR",
            Error::DeviceNotFound(_) => "DEVICE_NOT_FOUND",
            Error::Unsupported(_) => "UNSUPPORTED_MEDIA",
            Error::Unavailable(_) => "AUDIO_UNAVAILABLE",
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
