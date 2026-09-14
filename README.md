# omarchy-player

A premium, native music player for Omarchy Linux. Working name — the
product identity is decided in Phase 1 (design direction), see `PLAN.md`.

Not a Spotify clone. See `ARCHITECTURE.md` for the stack decisions and
rejected alternatives, and `PLAN.md` for the phased build plan.

## Development

```
npm install
npm run tauri dev
```

## Workspace layout

- `crates/player-core` — library database, scanning, metadata, search,
  playlists, favorites, history, settings. No Tauri or audio-backend
  awareness; exercised entirely by `cargo test`.
- `crates/audio-engine` — GStreamer-backed playback: decode, gapless,
  crossfade, EQ, device selection. No Tauri awareness.
- `crates/linux-integration` — MPRIS, desktop notifications, media keys.
  No Tauri awareness.
- `src-tauri` — thin IPC layer: `tauri::command` wrappers and event
  emission only. Playback/library/integration logic must never live here.
- `src` — React frontend.

## Quality gate

```
npm run typecheck
npm run lint
npm run format
npm run test
cargo fmt --check
cargo clippy --workspace --all-targets
cargo test --workspace
```
