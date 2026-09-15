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
- [x] **Phase 3 — Library Scanning & Metadata**: hand-rolled directory
      walk, `lofty` tag extraction with graceful fallbacks, embedded/
      folder artwork caching, mtime+hash-based new/modified/deleted/
      renamed detection (rename preserves favorites/playlists/history).
      19 new tests (52 total in `player-core`) including a real
      corrupt-file case and a 50k-file perf fixture. Caught and fixed a real O(n²) FTS5 indexing bug the perf
      fixture surfaced (50k files: 5+ min → 7.9s) — see ARCHITECTURE.md.
- [x] **Phase 4 — Audio Engine**: GStreamer `playbin3`-per-slot backend
      (`Backend` trait + `Slot::A`/`B`), gapless via `about-to-finish`,
      crossfade via dual-slot PipeWire mixing + volume ramp, EQ +
      pitch-preserving speed via an optional `audio-filter` bin, device
      enumeration/switching. 14 tests against `SimulatedBackend`. Two
      real bugs caught only by manual on-device verification against
      actual GStreamer/PipeWire (speed-seek-before-preroll; a missed
      crossfade window misreported as queue-exhausted) — both fixed,
      see ARCHITECTURE.md. Manually verified on this machine: play/
      pause/resume/seek/EQ/crossfade (audibly, dual-slot confirmed)/
      device-switch all work against real hardware.
- [x] **Phase 5 — Application Shell & State Wiring**: a real
      `Player<GstreamerBackend>` wired into `src-tauri` behind a mutex,
      16 IPC commands, a 200ms tick loop emitting `player-event`/
      `player-position`. Zustand playback store consuming those events.
      Sidebar (collapsible, tooltips when collapsed, no layout jump) +
      10 real navigable views with proper empty states, replacing the
      Phase 1 gallery. Settings' Appearance section is real (theme
      picker persisted via player-core's settings table through a new
      generic get/set-setting IPC bridge). Caught a real WebKitGTK CSS
      Grid bug on-device (an `auto` track wouldn't track a transitioning
      child's width — sidebar always rendered collapsed regardless of
      state); fixed by switching the shell layout to Flexbox.
      State-based view switching, no router — simple and sufficient for
      a fixed sidebar with no deep-linking need.
- [x] **Phase 6 — Library Browsing at Scale**: real join queries backing
      Library/Albums/Artists, `@tanstack/react-virtual` everywhere (grid
      for Albums, rows for Library/Artists), debounced FTS5 search,
      native folder picker (`xdg-portal`) wired to the real scan path.
      Caught a critical bug only by seeding the real on-disk database
      with 50k tracks (all existing tests use an in-memory database,
      which hid it completely): SQLite's default fsync-per-commit made a
      real scan take over an hour instead of 7.9s. Fixed with WAL +
      synchronous=NORMAL + wrapping the scan in one transaction — back
      to 7.27s. Verified on-device: 50k songs, 500 albums, 500 artists,
      correct counts/sorting, ~28 DOM nodes mounted regardless of list
      size, 44ms full browse query.
- [x] **Phase 7 — Now Playing / Mini-Player / Full Player**: one shared
      component tree (`MiniPlayer` + `FullPlayer`, connected by
      `PlayerDock`) rather than four separate implementations, since the
      spec's compact/bottom states overlap heavily with mini/full.
      `framer-motion` shared-element transition (shared `layoutId`)
      between them; `MotionConfig` with `reducedMotion="user"` for
      global prefers-reduced-motion. Real favorites wiring (3 new IPC commands over `player-core`'s
      Phase-2 favorites table, previously unused by any UI). New
      `useNowPlaying.test.tsx` covering the hook's index/boundary logic.
      Deliberate scope decision: Previous/Next fall back to adjacent
      track in library sort order until Phase 8 builds a real queue.
      Verified on-device with real playing audio and real library data;
      Zustand store confirmed as the only source of truth (neither
      component keeps its own copy of playback state).
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
