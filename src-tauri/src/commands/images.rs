//! Reads a user-picked local image file for use as a custom background
//! (spec §24). See `player_core::images`'s doc comment for why this is a
//! one-shot data-URL read rather than a persistent asset-protocol grant.

use crate::error::AppResult;

#[tauri::command]
pub fn read_image_as_data_url(path: String) -> AppResult<String> {
    Ok(player_core::images::read_as_data_url(
        std::path::Path::new(&path),
    )?)
}
