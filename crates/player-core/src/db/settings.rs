//! Settings as a simple key/JSON-value store — the Settings UI (spec §23)
//! reads and writes individual keys rather than one big blob, so a bad
//! write to one setting can never corrupt the rest.

use super::Database;
use crate::error::Result;
use rusqlite::{params, OptionalExtension};
use serde::{de::DeserializeOwned, Serialize};

impl Database {
    pub fn set_setting<T: Serialize>(&self, key: &str, value: &T) -> Result<()> {
        let json = serde_json::to_string(value)
            .map_err(|e| crate::error::Error::Internal(e.to_string()))?;
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, json],
        )?;
        Ok(())
    }

    pub fn get_setting<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>> {
        let raw: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()?;
        match raw {
            Some(json) => serde_json::from_str(&json)
                .map(Some)
                .map_err(|e| crate::error::Error::Internal(e.to_string())),
            None => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct Crossfade {
        enabled: bool,
        duration_ms: u32,
    }

    #[test]
    fn round_trips_a_typed_value() {
        let db = Database::open_in_memory().unwrap();
        let value = Crossfade {
            enabled: true,
            duration_ms: 2500,
        };
        db.set_setting("playback.crossfade", &value).unwrap();

        let fetched: Crossfade = db.get_setting("playback.crossfade").unwrap().unwrap();
        assert_eq!(fetched, value);
    }

    #[test]
    fn missing_key_returns_none() {
        let db = Database::open_in_memory().unwrap();
        let fetched: Option<String> = db.get_setting("nonexistent").unwrap();
        assert!(fetched.is_none());
    }

    #[test]
    fn overwriting_a_key_replaces_the_value() {
        let db = Database::open_in_memory().unwrap();
        db.set_setting("volume", &50).unwrap();
        db.set_setting("volume", &75).unwrap();
        let fetched: i64 = db.get_setting("volume").unwrap().unwrap();
        assert_eq!(fetched, 75);
    }
}
