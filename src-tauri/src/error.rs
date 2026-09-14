//! Application-wide error type for the Tauri IPC layer.
//!
//! Every error that can reach the frontend carries a machine-readable
//! `code` and a human-readable `message` — never a raw Rust stack trace
//! (spec §27). This layer only wraps errors from the engine crates; it
//! must never originate playback/library/integration logic itself.

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    Library(#[from] player_core::error::Error),

    #[error(transparent)]
    Audio(#[from] audio_engine::error::Error),

    #[error(transparent)]
    Integration(#[from] linux_integration::error::Error),
}

#[derive(Debug, Serialize)]
pub struct AppErrorPayload {
    pub code: &'static str,
    pub message: String,
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Library(e) => e.code(),
            AppError::Audio(e) => e.code(),
            AppError::Integration(e) => e.code(),
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        AppErrorPayload {
            code: self.code(),
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;
