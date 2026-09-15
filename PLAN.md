# Phase Checklist

Full detail for each phase lives in the plan approved at the start of this
project (`/home/trg/.claude/plans/splendid-dazzling-balloon.md`). This file
tracks actual progress — update it as phases complete, don't assume the
plan file's existence means work happened.

- [x] **Phase 0 — Scaffolding & Tooling**: Tauri 2 + React 19/TS-strict +
      Vite scaffold, Cargo workspace (`player-core`, `audio-engine`,
      `linux-integration`, `src-tauri`), ESLint/Prettier/rustfmt/Clippy/
      Vitest all wired and green, git initialized.
- [x] **Phase 1 — Design System & Visual Identity**: tokens (type/spacing/
      radius/motion), three themes (Omarchy Dark pulled live from this
      machine's colors.toml, Omarchy Light authored companion, AMOLED
      Dark), 12 component primitives, product named "Amp." Verified
      on-device: launched, hit the known WebKitGTK/NVIDIA/Wayland crash,
      fixed with the same workaround already proven in mc-launcher/
      rgb-control-center, then confirmed rendering via screenshot.
- [x] **Phase 2 — Persistence Layer**: SQLite schema + migrations + FTS5
      search index in `player-core`. 11 tables, indexes on
      artist_id/album_id/genre_id/added_at/played_at, 29 unit tests
      covering schema creation, migration idempotency, and CRUD for every
      table (tracks, albums, artists, genres, playlists+playlist_tracks,
      favorites, playback_history, queue, settings, scan_state, search).
- [ ] **Phase 3 — Library Scanning & Metadata**: async scan, `lofty` tags,
      artwork pipeline, incremental rescan.
- [ ] **Phase 4 — Audio Engine**: GStreamer playback, gapless, crossfade,
      EQ, device selection.
- [ ] **Phase 5 — Application Shell & State Wiring**: sidebar, routing,
      Zustand playback store, Context providers, all views navigable.
- [ ] **Phase 6 — Library Browsing at Scale**: virtualized lists, real
      data, search against FTS5.
- [ ] **Phase 7 — Now Playing / Mini-Player / Full Player**.
- [ ] **Phase 8 — Queue & Playlists**: drag-reorder, CRUD.
- [ ] **Phase 9 — Command Palette & Context Menus**.
- [ ] **Phase 10 — Metadata Editor & Artwork Editing**.
- [ ] **Phase 11 — Linux/Omarchy Integration**: MPRIS, media keys,
      notifications, PipeWire device switching.
- [ ] **Phase 12 — Keyboard Shortcuts, Accessibility, Settings**.
- [ ] **Phase 13 — Performance Hardening**: 50k-track fixture profiling.
- [ ] **Phase 14 — Testing & Build Quality Gate (§36/§38)**.
- [ ] **Phase 15 — UI/UX Polish Pass + Second Performance Pass**.
- [ ] **Phase 16 — Security Pass (§37)**.
- [ ] **Phase 17 — Release Readiness**.
