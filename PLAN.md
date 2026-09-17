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
- [x] **Phase 8 — Queue & Playlists**: real persisted queue
      (`queue`/`playlist_tracks` rows keyed by their own row id, not
      `track_id`, so a track can repeat and still be independently
      reordered/removed) with `@dnd-kit/sortable` drag-reorder at 60fps
      via a shared `SortableRow` component. `queueStore` keeps
      `audio_engine::Player`'s `next` slot synced to the queue's head;
      `playbackStore` gained a real (non-persisted) history stack for
      Previous, retiring Phase 7's library-sort-order fallback entirely.
      Playlist CRUD (create/rename/description/delete/add/remove/
      reorder tracks) with a new `ConfirmDialog` gating deletion.
      Library rows gained a "..." actions menu (Play Next/Add to Queue/
      Add to Playlist) reusing Phase 1's `Menu`/`Popover`. Verified
      on-device with a real scanned 4-track library, seeded queue, and
      seeded playlist; caught and fixed two real bugs only visible this
      way (Queue's empty-state gating condition; a render-time parent
      setState call racing playlistsStore's initial load) — see
      ARCHITECTURE.md.
- [x] **Phase 9 — Command Palette & Context Menus**: one shared
      `buildTrackMenuItems` builder (Play/Play Next/Add to Queue/Add to
      Playlist/Favorite/View Artist/View Album/Copy Info/Open File
      Location/Remove From Library) used by every track-listing view —
      Library, Queue, playlist detail, and the newly real Favorites and
      Recently Played views (both previously permanent empty states).
      New `ArtistDetail`/`AlbumDetail` views (filtering already-loaded
      library data client-side) give "View Artist"/"View Album"
      somewhere real to navigate to, via a new `navigationStore` lifted
      out of `Shell.tsx`'s local view-switching state. Ctrl+K command
      palette: static navigation commands plus live FTS5 track search
      and client-side album/artist/playlist matching. Two new global
      dialog stores back Add-to-Playlist/Confirm everywhere instead of
      per-view dialog instances. "Edit Metadata" deliberately omitted
      (Phase 10's job); no bulk album/artist-level menu (their tiles
      gained real click-through navigation instead). Verified on-device
      with a real scanned library, favorites, and play history. Caught
      and fixed a real bug reported live by the user mid-phase: a
      `Popover` positioning assumption (`window.innerWidth - 240`,
      fine for Phase 1's short dropdowns) broke once this phase's much
      wider context menu used it, rendering off-screen near the right
      edge — already flagged as a known limitation in the Phase 8
      bug-hunt pass specifically pending this phase. See
      ARCHITECTURE.md.
- [x] **Phase 10 — Metadata Editor & Artwork Editing**: dialog for
      title/artist/album/album artist/genre/year/track/disc/artwork,
      writing via `lofty` only after the shared destructive-action
      confirmation. Writes reuse the scan pipeline (`scan::process_file`)
      to re-derive the DB row exactly as a fresh scan would, rather than
      duplicating artist/album/genre resolution. Path-traversal defense
      (spec §37) canonicalizes both the track's path and every
      configured scan root before comparing, with a dedicated
      `PathOutsideLibrary` error. Artwork import sends the picker's file
      path over IPC, not raw bytes. Caught a real focus-stealing bug via
      a Vitest test that types through the dialog like a real user
      (`MetadataEditDialog`'s `onClose` wasn't memoized, so `Dialog`'s
      focus trap refired on every keystroke). Verified fully on-device:
      a real scanned file's title edited through the actual dialog
      updated both the file and the DB with the UI reflecting it
      immediately, and removing the file's scan root and retrying
      produced the exact path-outside-library rejection with nothing
      written. See ARCHITECTURE.md.
- [x] **Phase 11 — Linux/Omarchy Integration**: MPRIS via `mpris-server`'s
      `Send`-safe `Server`/`RootInterface`/`PlayerInterface` traits
      (backed by `Arc<Mutex<...>>`, running on the app's existing async
      runtime); desktop track-change notifications via `notify-rust`,
      gated by a new Settings toggle; PipeWire device list confirmed
      already real from Phase 4. "Media-key capture" needed no code —
      Omarchy's Hyprland keybinds already route XF86Audio* keys through
      Quickshell's built-in MPRIS client, so implementing MPRIS
      correctly _is_ the media-key story on this desktop (confirmed:
      Quickshell's own media widget picked up the service natively).
      Mid-phase architecture change after a real, fully-reproduced bug:
      the first implementation used `mpris-server`'s `!Send`, `Rc`-based
      `Player` on a dedicated thread, which silently stopped reflecting
      state to external D-Bus queries the moment a real GStreamer
      pipeline in the same process started actively streaming (root-
      caused via a series of minimal standalone reproductions, not
      guesswork) — switched to the `Send`-safe interface traits, which
      need no dedicated thread and don't exhibit the problem. Verified
      fully on-device via `busctl`/`dbus-monitor` (not logs): live
      PlaybackStatus/Metadata/Position/CanGoNext during real playback,
      working Play/Pause/Seek control, a seek past track-end correctly
      falling through to natural EOS, and a real `Notify` call with
      correct title/subtitle and a genuine resolved artwork path. See
      ARCHITECTURE.md.
- [x] **Phase 12 — Keyboard Shortcuts, Accessibility, Settings**: a
      single `document`-level global shortcut manager
      (`GlobalShortcuts.tsx`) dispatches Space/arrows/N/P/F/Ctrl+K/L/Q/
      Shift+P/Escape against a persisted, rebindable bindings store,
      deferring to any more-specific component via `e.defaultPrevented`
      and suppressing bare-letter combos while a text input is focused.
      Filled in Settings' four remaining stub sections (Playback
      crossfade, Library scan-roots, Audio device+10-band EQ, Keyboard
      rebind UI with conflict detection) — "Advanced" is now the only
      section left, explicitly deferred since it has no backend to
      wire up yet. Accessibility pass fixed two real, hand-calculated
      WCAG contrast failures (Toggle's thumb fill, CommandPalette's
      missing focus indicator). Found and fixed a critical full-app-
      crash bug during this phase's own on-device testing: a
      frontend-initiated seek while MPRIS was live called the bare
      `tokio::spawn` from a synchronous Tauri command's thread-pool
      thread (no ambient runtime context), aborting the whole process —
      latent since Phase 11, invisible to that phase's own verification
      since it only ever drove MPRIS-_initiated_ seeks. Fixed by
      capturing a `tokio::runtime::Handle` at MPRIS-startup time and
      spawning through it instead. Verified fully on-device, keyboard-
      only: every shortcut fires and respects the text-input guard, the
      rebind/conflict-detection/reset flow works reached purely via Tab
      navigation, and all four new Settings sections render and persist
      correctly. See ARCHITECTURE.md.
- [x] **Phase 13 — Performance Hardening**: audit-first — most checks
      confirmed the code already does the right thing (React re-render
      discipline, scan running off the UI thread via `spawn_blocking`,
      debounce values, list virtualization scoped to what actually
      reaches library scale) rather than needing a fix. Two real fixes
      landed: (1) the artwork disk cache had no bound in either
      direction a track leaves the library — neither a rescan-detected
      deletion, "Remove From Library," nor removing a scan root
      entirely (which also left every one of its tracks permanently
      orphaned in the DB, not just their artwork) ever cleaned up the
      cached file or the orphaned rows; fixed with two new player-core
      functions, `remove_cached_artwork` and
      `remove_scan_root_and_its_tracks`, both regression-tested against
      a confirmed-failing reverted version. (2) The playback tick loop
      emitted `player-position` to the frontend unconditionally every
      200ms forever, even while paused or idle, and recomputed an
      invariant XDG cache path on every tick — both fixed by gating on
      `is_playing()` and hoisting the path lookup out of the loop.
      Re-ran the 50k-track scan fixture in release mode (the historical
      baseline's own build profile) and confirmed no regression: 5.45s,
      actually faster than the earlier figure. Measured real startup
      (378ms cold, via a proper `tauri build --no-bundle`, not a plain
      `cargo build --release`) and memory (~200MB RSS, mostly
      WebKitGTK's own baseline) — both comfortably reasonable. See
      ARCHITECTURE.md.
- [x] **Phase 14 — Testing & Build Quality Gate (§36/§38)**: filled real
      test-suite gaps the audit actually found (the four Phase 12
      Settings views had zero coverage beyond their store; Library
      search only had a race-condition test, never a happy-path one) —
      not padding, real behavioral coverage. A user-requested
      full-codebase bug-hunt pass (17 findings, 13 fixed) ran in
      between and took priority once it surfaced real bugs. §38's
      checklist then ran against a real production build launched via
      a real desktop entry (not `cargo run`/dev server): scanning/large
      libraries and missing/corrupt files verified via existing DB
      state + the Rust test suite's own precise coverage rather than
      re-deriving what's already proven; playback/MPRIS verified with a
      real track played and independently confirmed via `busctl`, track-
      change notification included; app restart/persistence verified by
      actually killing and relaunching the production instance and
      confirming library, scan roots, and favorites all survived. Media
      keys and device switching unchanged from Phase 11/4's own
      findings (Quickshell handles the former; this machine has only
      one real output device for the latter). See ARCHITECTURE.md.
- [x] **Phase 15 — UI/UX Polish Pass + Second Performance Pass**:
      holistic second look via `omarchy-app-modern-design`, confirming
      the Phase 1 design system hasn't drifted (near-zero hardcoded
      colors/durations bypassing tokens anywhere). Found and fixed two
      real issues: `Icon`'s default size (18px) never matched the
      app's actual 16px convention every call site already used;
      Button/Sidebar/MediaRow/Toggle had hover and focus states but no
      pressed (`:active`) feedback at all, fixed via `frontend-design`'s
      guidance with a theme-agnostic press-down that reuses existing
      tokens rather than new colors. Second performance pass re-ran
      Phase 13's 50k-track fixture in release mode: 5.45s, matching
      Phase 13's own number — no regression. See ARCHITECTURE.md.
- [x] **Phase 16 — Security Pass (§37)**: full audit via
      `omarchy-app-security-hardening` — static analysis + `cargo audit`
      first, then manual file-by-file review of path-traversal defenses,
      SQL construction, the MPRIS/D-Bus surface, the Tauri capability
      grant, and untrusted-metadata flow from scanner to frontend. Two
      low-severity findings fixed (both confirmed with the user first):
      the `opener` capability was broader than needed (narrowed to
      `allow-reveal-item-in-dir` only), and the library DB/artwork cache
      were left world-readable by OS/crate defaults (now restricted to
      0700/0600 via a new `restrict_to_owner_only` helper). Verified
      rather than assumed: `metadata_editor.rs`'s path-traversal check
      is genuinely component-aware (not the bare-string-prefix bug
      found earlier in SQL), and the artwork cache's tag-derived file
      extension can't carry a path-traversal payload (traced into
      `lofty`'s actual source). One dependency advisory
      (RUSTSEC-2024-0429, transitive via `gstreamer-rs`) isn't fixable
      from this repo. See ARCHITECTURE.md for full findings and stated
      coverage gaps.
- [ ] **Phase 17 — Release Readiness**.
