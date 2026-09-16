# Architecture

## Stack

Tauri 2 + Rust (edition 2021) + React 19 + TypeScript (strict) + Vite,
npm. Matches the conventions of this user's sibling projects
(`mc-launcher`, `rgb-control-center`): same `tsconfig.json` strictness,
vanilla CSS with `:root` custom properties + `data-theme` theming (no
Tailwind/CSS-in-JS), `rusqlite` + `rusqlite_migration` for persistence,
`serde`/`thiserror`/`tracing`/`directories`/`tokio` as the core Rust crate
set, and a strict rule that engine logic never depends on `tauri`.

## Workspace layout

```
crates/player-core       — DB, scanning, metadata, search, playlists,
                            favorites, history, settings
crates/audio-engine       — GStreamer playback: decode, gapless,
                            crossfade, EQ, device selection
crates/linux-integration — MPRIS, notifications, media keys
src-tauri                — thin IPC layer only (tauri::command wrappers +
                            event emission); no playback/library logic
src                       — React frontend
```

This goes one step further than `mc-launcher`'s "`core/` has zero Tauri
awareness" rule by extracting each concern into its own Cargo workspace
crate, following `rgb-control-center`'s more mature pattern — justified
here because this app is bigger than either precedent and each engine
(scanning, GStreamer playback, MPRIS) needs to be testable without a
display or audio device.

## Rejected alternatives

- **GTK4/libadwaita, Electron, Qt6** — rejected for the same reasons
  recorded in the precedent projects' `ARCHITECTURE.md` files (Tauri gives
  a smaller footprint than Electron and faster iteration than native GTK/Qt
  while still reaching a native-feeling result on Omarchy).
- **`rodio` + `symphonia` (pure Rust) for audio** — rejected in favor of
  `gstreamer-rs`. This app's spec requires gapless playback, crossfade, a
  real multi-band EQ, and live PipeWire device switching simultaneously.
  GStreamer provides all four as first-class pipeline elements
  (`gapless`/about-to-finish signaling, `audiomixer`/crossfade,
  `equalizer-10bands`, direct `pipewiresink` control) and broader codec
  coverage (AAC/M4A via system plugins). Hand-rolling the same feature set
  on `rodio`/`cpal` would mean building a custom crossfade mixer and biquad
  EQ filter chain from scratch for a worse result. This is a deliberate
  deviation from the precedent projects' pure-Rust-crate preference,
  explained to and accepted by the user (2026-09-14) — trading a system
  library dependency (already present on virtually all Omarchy/Arch
  desktops; `gstreamer-1.0` 1.28 confirmed installed) for correctness on
  the hardest audio requirements.
- **Redux for all app state** — rejected; most state stays in React
  Context matching precedent. See below for the one deliberate exception.

## Deliberate new dependencies (beyond precedent)

Each was added only because a specific spec requirement made the
precedent's approach (plain Context/useState, no test runner, no lint
config) insufficient:

- **Zustand**, playback/transport state only (position, play/pause,
  volume, queue cursor). Playback position ticks every ~100–250ms; a
  Context update at that frequency re-renders the whole subtree unless
  carefully split. Zustand's selector-based subscriptions let only the
  progress bar/time labels re-render. Library/settings/theme state stays
  in Context, matching precedent.
- **`@tanstack/react-virtual`** — required to keep 50k+ row lists smooth;
  no prior project needed this scale.
- **`@dnd-kit/core`** — accessible drag-reorder for queue/playlists.
- **`framer-motion`** — shared-element-style transitions (mini-player ↔
  full player, page transitions); the spec's animation bar (§18) is high
  enough that hand-rolled CSS transitions would become a maintenance
  burden.
- **ESLint (flat config) + Prettier + `rustfmt.toml` + Clippy (default)** —
  neither precedent configured these, but §38 of the spec explicitly
  requires linting/formatting as a build gate.
- **Vitest + React Testing Library** — precedent had no frontend test
  runner (smaller UIs, `tsc --noEmit` sufficed). §36 explicitly requires
  testing frontend interactions.
- **SQLite FTS5** virtual table for search, queried via a Tauri command —
  keeps search "instant" at 50k+ tracks without shipping the whole library
  to the frontend or bundling a JS fuzzy-search library.
- **`lofty`** (pure Rust) — tag reading/writing across MP3/FLAC/WAV/OGG/
  Opus/M4A, including embedded art.
- **`mpris-server`**, **`notify-rust`** — standard, maintained, minimal
  crates for their respective integrations.

## Error handling convention

Each engine crate defines its own `Error`/`Result` type
(`thiserror`-derived, `Serialize`d as `{ code, message }` — never a raw
Rust stack trace, per spec §27). `src-tauri`'s `AppError` wraps all three
via `#[from]` and is the only error type that ever crosses the IPC
boundary to the frontend. This mirrors `mc-launcher`'s `AppError` pattern
(`src-tauri/src/error.rs`).

## Known tradeoff: WebKitGTK on NVIDIA/Wayland

Hit on first launch of this app on this machine, identically to
`mc-launcher` and `rgb-control-center`: WebKitGTK's DMA-BUF renderer
crashes with `Error 71 (Protocol error) dispatching to Wayland display` on
the NVIDIA proprietary driver under Wayland compositors (Hyprland,
GNOME/KDE Wayland sessions). Worked around in `src-tauri/src/main.rs` by
setting `WEBKIT_DISABLE_DMABUF_RENDERER=1` before GTK/WebKit initialize —
the same fix already verified working in both sibling projects on this
exact environment. Worth revisiting as NVIDIA's Wayland driver stack
matures.

## Phase 1: design system

Product named **Amp** — grounded in the design direction (see below), not
a generic placeholder. Full rationale for the token/theme choices lives in
`src/styles/theme.css`'s header comment; summarized here per
omarchy-app-modern-design's rule that every design choice ships with a
one-line rationale and a stated contrast standard.

**Direction**: "hardware panel, not glass panel" — matte layered blacks,
a warm amber accent pulled from this machine's live Omarchy theme, thin
hairline borders and background-layering for depth instead of shadows,
and a monospace face reserved strictly for genuine numeric transport
readouts (time, track/disc numbers, EQ bands) rather than decorative
labels. Typography is Omarchy's own system defaults (Liberation Sans /
JetBrainsMono Nerd Font, per `/etc/fonts/conf.d/50-omarchy.conf`) rather
than a bundled web font, so the app renders in the same faces as the rest
of the desktop.

**Contrast — checked against WCAG 2.1 AA (4.5:1 normal text, 3:1 large
text/UI components)**:

| Pair                    | Theme         | Ratio  | Passes                                                                           |
| ----------------------- | ------------- | ------ | -------------------------------------------------------------------------------- |
| foreground / background | Omarchy Dark  | 10.1:1 | Yes                                                                              |
| accent / background     | Omarchy Dark  | 7.4:1  | Yes                                                                              |
| danger / background     | Omarchy Dark  | 5.0:1  | Yes                                                                              |
| foreground / background | Omarchy Light | 15.7:1 | Yes                                                                              |
| accent / background     | Omarchy Light | 5.0:1  | Yes (darkened from the dark theme's raw #e68e0d, which only cleared ~4.0:1 here) |
| danger / background     | Omarchy Light | 5.6:1  | Yes                                                                              |
| foreground / background | AMOLED Dark   | 11.3:1 | Yes                                                                              |

**Before/after**: before this phase the app was an unstyled Tauri/React
tutorial scaffold (default logos, default black-on-white text, no theme
system). After: three complete, contrast-checked themes, a 14-component
primitive set (Button, Input, Slider, Card, Artwork, MediaRow, Tabs,
Tooltip, Popover, Menu, Dropdown, Dialog, Toast, Icon), and a named
product identity — verified rendering correctly on-device (see Known
tradeoff note above for the launch bug hit and fixed along the way).

## Phase 3: library scanning, metadata, artwork

Hand-rolled iterative (stack-based) directory walker rather than pulling
in `walkdir` — the traversal needed here (filter by extension, skip
hidden entries and symlinks) is simple enough to own directly, keeping
the dependency list smaller. Metadata comes from `lofty`; a missing tag
never blocks a file, it just falls back (title → filename stem, everything
else → `None`), and an unparseable file is recorded in
`ScanSummary::errors` and skipped, never aborting the scan (verified with
a real corrupt-file test).

**Change detection**: new/modified files are found by comparing on-disk
mtime against the last-scanned mtime stored per track. Deleted vs.
renamed is disambiguated by hashing the small set of files that don't
match on path alone (a cheap streamed `DefaultHasher` over file content,
not cryptographic — this is a heuristic for "same file, different path,"
not a security boundary) and matching that hash against tracks that
disappeared from their old path; a match repoints the existing row
(`rename_track_path`) instead of delete-then-reinsert, so a renamed
track's favorites/playlist membership/history survive. Verified this
specifically: a test renames a favorited track's file and asserts the
favorite is still set afterward.

**Artwork**: embedded tag art takes priority over folder art
(`cover`/`folder`/`album`/`front`.`jpg`/`jpeg`/`png`, matched
case-insensitively), cached to disk keyed by content hash. No DB column
tracks the cache path — the cache directory itself is the source of
truth (a lookup is just "does `<cache_dir>/artwork/track-<hash>.<ext>`
exist"), avoiding a schema column that could drift out of sync with the
actual cache contents.

**Performance bug caught by the 50k-file exit-criteria fixture**: the
FTS5 `tracks_fts` table originally carried an explicit `track_id
UNINDEXED` column, with every (re)index doing `DELETE ... WHERE track_id
= ?` first. An `UNINDEXED` column cannot be used for lookups — every
delete was a full table scan, so `n` sequential inserts-with-delete cost
O(n²) overall. This was invisible at small scale (2,000 files: 0.83s) but
made the 50k-file fixture take well over 5 minutes before being killed.
Fixed by using FTS5's own `rowid` as the track id (set explicitly on
insert, deleted by `WHERE rowid = ?`) instead of a separate unindexed
column — rowid lookups are indexed by construction. After the fix, the
same 50k-file scan completes in **7.9s** (release build, this machine).
This is exactly the kind of regression the plan's Phase 13 performance
pass exists to catch — it just happened to surface immediately here
because Phase 3's own exit criteria already demanded a 50k-file run.

## Phase 4: audio engine

**Note on how this phase was built**: a duplicate Claude Code session was
independently working on this same project concurrently (a second
terminal window left open on this machine) and had already sketched
`types.rs`/`backend/mod.rs`/`backend/simulated.rs`/`backend/real.rs`
(the `Backend` trait + `Slot::A`/`Slot::B` design) before being asked to
stand down. That sketch was adopted as the foundation — reconciled,
completed, debugged, and verified below — rather than discarded in favor
of a second, independently-written draft, to avoid throwing away sound
work.

**Design**: `Backend` trait addressed by `Slot` (`A`/`B`), one
`GstreamerBackend` instance manages both slots' `playbin3` pipelines
internally. Gapless uses `playbin3`'s own `about-to-finish` signal
(zero-gap, the standard mechanism). Crossfade is deliberately **not**
in-process audio mixing — two independent `playbin3` slots each play to
their own `pipewiresink`, and PipeWire mixes the concurrent client
streams itself (exactly like two unrelated apps playing at once);
`Player`'s linear volume ramp on both slots during the transition is
what makes that mixing sound like a crossfade. This avoids building an
in-process `audiomixer` bin entirely. EQ (`equalizer-10bands`) and
pitch-preserving speed (`scaletempo`) are inserted via `playbin3`'s
`audio-filter` property; both are treated as optional — if
`gst-plugins-good` isn't installed, `Player` logs a warning and runs
without them rather than failing to start (spec §27).

`Player<B: Backend>` owns the crossfade/gapless timing state machine and
is exercised entirely against `SimulatedBackend` in `cargo test` — no
display, audio device, or GStreamer installation required for the test
suite.

**Two real bugs only found by testing against actual GStreamer/PipeWire
hardware** (not caught by the simulated-backend unit tests, which is
exactly why the plan calls for a manual on-device pass every phase that
touches runtime behavior):

1. **Speed-seek on a not-yet-prerolled pipeline.** `Player` applies the
   stored playback rate to every freshly loaded slot, including the
   default `1.0` case, before calling `play()`. GStreamer rejects a
   rate-seek on a pipeline still in `NULL`/`READY` (not yet prerolled),
   so the very first `play_now()` failed outright with `"Failed to
seek"`. Fixed in `backend/real.rs`: `rate == 1.0` is now a no-op (a
   normal-speed pipeline never needs a seek at all), and any other rate
   is skipped rather than erroring unless the pipeline is already at
   least `Paused` — real speed changes happen interactively while a
   track is already playing, so this matches actual usage.
2. **A missed crossfade window was reported as a false "queue
   exhausted."** `Player::tick` only checks "are we inside the crossfade
   window" when it's called — but a real pipeline keeps playing in
   wall-clock time between `tick()` calls. If the gap between ticks (or
   time spent in other work between them) lets the active slot reach
   genuine `EOS` before a tick ever gets to notice the window, the old
   code treated that bare `Eos` as "nothing queued, stop" even though
   `next` was set — reproduced live by inserting a few hundred ms of
   `sleep()` between `seek()`/EQ calls and starting the tick loop.
   Fixed in `player.rs`: `Eos` now checks `next` first and recovers by
   advancing immediately on the same slot (a degraded, non-ramped
   transition) rather than reporting `PlaybackFinished`; if a crossfade
   is already in progress, the bare `Eos` from the old slot finishing
   right as the ramp completes is correctly ignored, since the ramp's
   own completion branch handles that transition. Covered by
   `eos_with_a_queued_next_recovers_instead_of_reporting_finished`.

**Manual on-device verification** (via two throwaway example binaries,
removed after use — see git history if reproducing): real playback
against actual generated WAV files through `GstreamerBackend` →
`pipewiresink`, confirmed:

- Play, pause (position freezes), resume, and seek (position jumped to
  the seeked target) all work.
- EQ band-setting doesn't error against a real `equalizer-10bands`
  element.
- Device enumeration returns this machine's real PipeWire sinks.
- The smooth dual-slot volume-ramped crossfade actually ran on real
  hardware: with tight, uninterrupted ticking from playback start, the
  inactive slot was already ~1.9s into its own playback by the time a
  2-second crossfade completed — consistent with both slots genuinely
  running and mixing concurrently, not a same-slot fallback swap. It
  was also audible: the 440Hz tone blended into 660Hz rather than
  cutting.
- Switching the output device mid-playback (to a different real
  PipeWire sink) did not error or interrupt playback.

## Post-Phase-4 bug-hunt pass (2026-09-15)

A dedicated review pass across the whole app (not tied to a specific
phase) found and fixed five real bugs, none caught by the existing test
suite until new tests were added alongside each fix:

1. **`Player::is_playing()` didn't track pause state at all.** It
   inferred "playing" from `position_ms().is_some()`, but both
   `SimulatedBackend` and `GstreamerBackend` report a valid position for
   a loaded-but-paused slot too — so the flag would read `true` any time
   a track was loaded, paused or not. Fixed by tracking `is_playing` as
   explicit state set by every transition (`play_now`/`pause`/`resume`/
   `stop`/EOS-with-no-next), not derived. Was unused so far (no caller
   yet), which is exactly why nothing caught it — worth remembering that
   "no test failure" isn't the same as "no bug" for not-yet-wired code.
2. **Output device ids were positional (`"gst-device-{index}"`) and
   cached in a map rebuilt on every `list_devices()` call.** If the
   device list changed (unplug/replug) between listing and selecting, a
   previously-returned id could silently resolve to the wrong hardware,
   or fail to resolve at all after a cache-clearing relist. Fixed by
   removing the cache entirely and keying by the device's display name,
   looked up fresh at selection time — no positional/cached state to go
   stale.
3. **Reordering the queue mid-crossfade retargeted an already-in-flight
   transition.** `set_next` unconditionally overwrote `Player::next`;
   the crossfade-completion code read `next` at completion time, so a
   reorder during the crossfade window made the transition land on the
   _new_ next track's id while the audio actually crossfading in was
   still the _old_ one — track metadata and audio would disagree.
   Fixed by capturing the crossfade's target track when the transition
   commits (not read again at completion), so `next` becomes freely
   reassignable mid-crossfade for whatever should follow it.
4. **Artwork cache-key collision when content hashing fails.** The
   cache key fell back to a fixed `"track-unknown"` string when
   `hash_file` errored (a rare I/O failure) — a second such file would
   silently overwrite the first's cached artwork. Fixed by hashing the
   file path itself as the fallback, which is always available and
   unique per file even when content hashing isn't.
5. **The Popover outside-click handler didn't recognize its own
   content.** `Popover` portals its content to `document.body`, so it's
   never a DOM descendant of `anchorRef` — the pointerdown-outside check
   only tested against the anchor, meaning a pointerdown on _any_ menu
   item (inside the portaled content) counted as "outside" and closed
   the menu before the item's own `onClick` could fire. This broke every
   menu action silently: it looked correct in a static screenshot
   (nothing about it is visually wrong) and only failed on actual
   interaction, which is exactly why it survived Phase 1's visual
   verification. Fixed by also checking the portaled content's own ref.
   First attempt at a regression test for this passed even against the
   unfixed code — the test harness hardcoded `open` as a literal `true`
   instead of wiring it to real state via `onClose`, so the popover
   never actually unmounted regardless of the bug. Rewriting the harness
   to use real state (matching how every actual call site works) made
   the test correctly fail without the fix and pass with it — confirmed
   by deliberately reverting the fix and re-running.

**Lesson**: a component or method with no caller yet, or a test harness
that doesn't mirror real usage, will not surface a bug no matter how
thorough it looks — verify a fix's test actually fails without the fix
before trusting it, not just that it passes with the fix.

## Phase 5: application shell & state wiring

**Backend**: `src-tauri/src/state.rs` holds `Mutex<Option<Player<
GstreamerBackend>>>` and `Mutex<Database>` behind `tauri::State`. The
player is `Option` because `GstreamerBackend::new()` can fail (no
GStreamer/PipeWire) — the app still starts in that case, logs the
failure, and every player command returns a clear `AUDIO_UNAVAILABLE`
error instead of the whole process crashing (spec §27). A new
`audio_engine::Error::Unavailable` variant carries this distinctly from
`Pipeline` (a runtime failure of an otherwise-working backend). 16
commands in `src-tauri/src/commands/` are thin pass-throughs to `Player`
methods — no playback logic lives in the Tauri layer, matching the
plan's own layering rule. A `tauri::async_runtime::spawn`ed loop ticks
the player every 200ms and emits `player-event` (state transitions) and
`player-position` (continuous ticking for a future progress bar) as
separate event channels, since `PlayerEvent` doesn't carry position.

**Settings persistence**: rather than one Tauri command per setting,
`get_setting`/`set_setting` bridge opaque `serde_json::Value`s to
`player_core::Database`'s existing settings table (built in Phase 2) —
Tauri commands can't be generic, so the type-specific shape of a given
setting is the frontend's concern.

**Frontend**: a Zustand store (`src/store/playbackStore.ts`) is the
single source of truth for playback UI state, hydrated once via
`player_status` on mount and kept live via the two event channels above
— exactly the high-frequency-update case Zustand was chosen for back in
Phase 1's dependency list. `src/lib/ipc.ts` centralizes every
`invoke`/`listen` call so a renamed or reshaped command only needs
updating once.

Sidebar + 10 real navigable views (Home, Music Library, Albums, Artists,
Playlists, Favorites, Recently Played, Queue, Downloads, Settings)
replace the Phase 1 design-system gallery, which is retired now that its
purpose is served (documented via screenshots in this file and superseded
by `Menu.test.tsx`'s more properly-scoped interaction coverage). No
router: view switching is a plain `useState<ViewId>` in `Shell.tsx`,
matching `mc-launcher`'s precedent — a fixed sidebar with no deep-linking
need doesn't justify `react-router-dom`. Settings' Appearance section is
real (the theme picker from Phase 1, now persisted).

**Real bug caught only by on-device screenshot verification**: the
sidebar always rendered icon-only/collapsed regardless of React state.
A debug log confirmed `collapsed` was correctly `false` — this was a
pure CSS bug, not a state bug. The shell used `grid-template-columns:
auto 1fr` expecting the `auto` track to continuously track the
sidebar's own transitioning `width`; this WebKitGTK version doesn't
size that reliably; the track collapsed to icon-only width regardless
of the sidebar's actual computed width. Fixed by switching `.op-shell`
to Flexbox (`flex-shrink: 0` on the sidebar makes its width
authoritative, no track-sizing ambiguity). Verified both states with
screenshots, including forcing the collapsed default temporarily to
confirm that CSS path too. Worth remembering: automated jsdom tests
cannot catch this class of bug at all — jsdom doesn't compute real
layout — so this was only reachable through actual on-device rendering.

## Phase 6: library browsing at scale

**Backend**: new `db/browse.rs` join queries (`list_tracks_for_browse`,
`list_albums_for_browse`, `list_artists_for_browse`,
`search_tracks_for_browse`) return the _whole_ result set in one call,
joined and display-ready — virtualization is the frontend's job, not
this layer's, so fetching 50k lightweight rows once is the right
tradeoff versus paginating or re-fetching per scroll position. Seven new
`src-tauri` commands wrap these plus `library_add_folder` (native
folder picker via `tauri-plugin-dialog`, `xdg-portal` feature so it's a
real portal dialog on Omarchy/Wayland rather than a GTK3 fallback),
running the scan on a blocking thread per spec §19.

**Frontend**: `LibraryContext` is the shared source of truth for
tracks/albums/artists, hydrated on mount and refreshed after a folder
scan. `Library`/`Albums`/`Artists` each use `@tanstack/react-virtual` —
row virtualization for the first two, a responsive grid (columns
computed from a `ResizeObserver`'d container width, spec §33) for
Albums. Search is debounced (200ms) against the FTS5-backed
`library_search` command.

**Two real bugs, both caught only by seeding the actual on-disk app
database with a 50k-track fixture** (not by any existing test, which
all use an in-memory database):

1. **The critical one**: scanning 50k files into the real database
   didn't finish in 120 seconds (extrapolated: over an hour), versus
   7.9s for the identical fixture in Phase 3's _in-memory_ benchmark.
   Root cause: SQLite's defaults (rollback-journal mode,
   `synchronous=FULL`) fsync on every auto-committed statement — invisible
   against an in-memory database (no fsync cost at all), catastrophic
   against a real disk. Fixed two ways: `Database::open` now sets
   `journal_mode=WAL` + `synchronous=NORMAL` (the standard safe pairing
   for a desktop app — still durable across an application crash, only
   an OS crash/power loss could lose the last few WAL frames), and
   `scan_root` now wraps its entire per-file loop in one transaction via
   `Connection::unchecked_transaction()` (RAII — rolls back cleanly on
   any early `?` return) instead of leaving every write auto-committed.
   Result: **7.27s**, matching the in-memory benchmark almost exactly.
   This is worth remembering as a general lesson, not just for this
   project: an in-memory-database test suite can validate query
   _correctness_ perfectly while saying nothing at all about real-disk
   _write_ performance — the two are different enough in cost model that
   one cannot stand in for the other.
2. A test-mock gap (not a production bug): `App.test.tsx`'s `invoke`
   mock didn't know about the new `library_*` commands and fell through
   to resolving `undefined`, which crashed `Albums`/`Artists` on
   `.length`. Fixed the mock; also hardened the IPC layer itself
   (`listOrEmpty` in `lib/ipc.ts`) to coerce a non-array response to `[]`
   rather than trust `invoke`'s compile-time-only type assertion — an
   IPC boundary is worth defending like any other untrusted input (spec
   §37), even though the real backend cannot currently produce this
   case.

**Verified on-device** with the real 50k-track fixture seeded into the
actual app database (not the test suite): Music Library shows "50,000
songs" and scrolls with only ~28 `.op-media-row` DOM nodes mounted at
any time (confirmed via a temporary console log, removed after);
Albums correctly aggregates to 500 albums with per-album track counts;
Artists to 500 artists with per-artist album/track counts; the full
joined browse query itself runs in 44ms at this scale.

**Deliberately out of scope for this phase**: Album tiles and Artist
rows are display-only — no click-through to a filtered/detail view yet.
That's a better fit for the album/artist detail pages a later phase
should build than for search-query hijacking bolted on here.

## Phase 7: now playing, mini-player, full player

**One component tree, not four.** The spec's §8/§9 describe full-screen,
compact, bottom, and mini player states, but compact/bottom overlap so
heavily with mini/full that building all four as separate implementations
would just be four copies of the same transport logic with different CSS.
Built two real states — `MiniPlayer` (persistent bottom bar, always
mounted in `Shell.tsx`) and `FullPlayer` (a `position: fixed; inset: 0`
overlay) — connected by `PlayerDock`, which owns exactly one piece of
state (`expanded: boolean`) and nothing about playback itself.
`usePlaybackStore` remains the single source of truth for
track/position/playing state, read identically by both components — this
was the phase's explicit exit criterion, and it holds: neither component
keeps its own copy of `isPlaying`/`positionMs`.

**Shared-element transition**: both components wrap their `Artwork` in a
`motion.div layoutId="now-playing-artwork"`; `framer-motion` handles the
FLIP animation between the mini-player's 44px artwork and the full
player's 360px artwork automatically from that shared `layoutId`, no
manual position math. Global `prefers-reduced-motion` handling is one
`<MotionConfig reducedMotion="user">` wrapping the whole app in `App.tsx`
— `"user"` (not `"always"`) respects the OS setting rather than forcing
reduced motion unconditionally, matching spec §18's intent.

**Favorites** (`player-core`'s favorites table existed since Phase 2 but
had no UI until now): three thin `src-tauri` commands
(`favorites_is_favorite`/`favorites_toggle`/`favorites_list_ids`), with
`favorites_toggle` returning the new state so the frontend doesn't need a
round-trip re-check. `playbackStore` fetches favorite status on `init()`
and on every track change (`playNow`, `TrackAdvanced`, `PlaybackFinished`
events) so the heart icon is always correct for whatever's actually
playing, not stale from the previous track.

**Deliberate scope decision — no real queue yet**: `useNowPlaying`'s
Previous/Next fall back to "adjacent track in the current library sort
order" (`tracks.findIndex` against `LibraryContext`), documented inline
in the hook. This is a real, honest behavior — not a fake placeholder —
but it's explicitly provisional: Phase 8 builds an actual queue, and
Previous/Next should switch to walking that queue instead once it
exists.

**Process lesson, not a product bug**: while verifying on-device, the
mini-player briefly appeared to have a track-lookup bug (showed "Nothing
playing" despite a visibly advancing progress bar). A temporary
`console.error` in `MiniPlayer.tsx` showed `currentTrack` was genuinely
`null` — the short test clip used for verification had already reached a
real `PlaybackFinished` event before the screenshot was taken. Correct
behavior; the verification harness was wrong, not the app. Fixed by
looping the test clip (`setInterval(() => player.seek(0), 2000)`) rather
than touching any application code. Worth remembering: confirm a
"bug" is real before fixing it — a plausible-looking failure during
manual verification can be an artifact of the verification setup itself.

**New test**: `useNowPlaying.test.tsx` covers the hook's actual branching
logic (index lookup, both list-boundary conditions, a current-track-id
no-longer-in-the-library case, and that `playNext`/`playPrevious` call
`playNow` with the correct neighbor's file URI) with the library/store
dependencies mocked — `MiniPlayer`/`FullPlayer` themselves are thin
presentational wiring over already-tested store/hook logic and existing
primitives, so the hook is where the real logic (and the real test value)
lives.

## Post-Phase-7 bug-hunt pass

A dedicated review pass over Phase 7 and its integration points, following
the same discipline as the post-Phase-4 bug-hunt: read the actual code
looking for real, demonstrable failure modes rather than trusting that a
green quality gate means correct behavior. Found and fixed two real bugs.

1. **Real bug: `playbackStore` had no defense against out-of-order
   command replies.** Tauri dispatches non-`async` commands (all of
   `player_status`/`player_play_now`/etc.) across a thread pool rather
   than a single ordered queue, so two overlapping invocations of the
   same command are not guaranteed to reply in the order they were
   called. `playbackStore.playNow` awaited `player.playNow(track)` and
   then unconditionally overwrote `currentTrack`/`isFavorite` — so a
   user double-clicking Next (or Next then Previous) fast enough to have
   two `playNow` calls in flight at once could end up with the store
   showing the _first_-clicked track as playing even though the _second_
   click's command actually reached the backend last and is what's
   really playing. Same shape of bug in the `TrackAdvanced` event
   handler and in `toggleFavorite` (rapid double-click on the heart could
   leave the UI showing the opposite of the DB's actual final state).
   Fixed with a monotonic sequence-number guard (`trackMutationSeq`,
   `favoriteSeq` in `playbackStore.ts`): each mutation captures the
   current counter before its `await`, bumps it, and only applies its
   `set()` if the counter is still unchanged when it resumes — so only
   the most-recently-_initiated_ call's result can ever stick, regardless
   of reply order. Verified with a real regression test
   (`playbackStore.test.ts`) using controllable deferred promises to
   force the out-of-order case; confirmed it fails without the fix (git
   stash showed `currentTrack` landing on the stale first-clicked track)
   and passes with it, same discipline as the Phase 4 Popover fix.
   **Known accepted limitation, not fixed here**: this guards
   client-_initiated_ races only. A separate, more theoretical race
   exists between the 200ms tick loop's event emission and a concurrent
   command's reply delivery — both share the same backend mutex so
   backend state itself stays consistent, but nothing currently
   guarantees an emitted `PlaybackFinished` for an old track can't be
   _delivered_ to the frontend after a newer `playNow`'s reply, which
   would incorrectly clobber good state back to "nothing playing." Fixing
   that properly needs a backend-generated monotonic counter attached to
   every event/command reply so the frontend can detect true staleness
   rather than relying on client-side call order; deferred as a
   Phase 13/14 hardening item since it requires a small backend contract
   change, not something to bolt on speculatively here.
2. **Process bug (not application code): a markdown code span broken
   across a line wrap in `PLAN.md`'s Phase 7 entry** (`` `layoutId=
"now-playing-artwork"` ``) made Prettier's output non-idempotent —
   `prettier --write` would "fix" the file and `prettier --check`
   would immediately flag it again. Fixed by rewording the sentence so
   no inline code span spans a line break. Worth remembering: a
   `format`/`--check` step that keeps failing right after `--write` was
   just run is a sign the input itself is malformed, not that the
   tool is broken.

## Full-codebase bug-hunt pass (post-Phase-7, second pass)

The user asked for a bug hunt across every file, not just Phase 7's. Given
the size (~7,100 lines across ~85 files), the hunt was split into four
parallel, read-only research passes (one per subsystem: `player-core`,
`audio-engine`, the `src-tauri` IPC layer + `linux-integration`, and the
remaining frontend components/views), each reporting candidate bugs with a
concrete failure scenario rather than style nits. Findings were then
verified by direct code reading and fixed here, one at a time, each with a
regression test confirmed to fail without its fix and pass with it
(reverted via `git stash`/manual edit, re-tested, restored — the same
discipline as the Phase 4 Popover fix).

**`src-tauri` + `linux-integration`**: no real bugs found. Confirmed
thin-IPC-layer discipline holds (every command is a lock, a delegate call,
a return), no lock-order inversion is possible (never more than one mutex
held per command), all camelCase/snake_case IPC parameter names match
their frontend call sites, and `linux-integration` remains the empty
Phase-11 scaffold it's supposed to be at this point.

**`audio-engine`** — two real bugs, both in `tick()`'s error handling:

1. A failed `backend.load()` during EOS-recovery or crossfade-start
   propagated via `?`, aborting the whole tick and discarding every event
   accumulated that tick. Worse: in the EOS-recovery path `self.next` had
   already been cleared by `.take()` before the fallible call, so nothing
   would ever retry — the player froze forever on the stale `current`
   track with a dead pipeline and zero visible error. In the
   crossfade-start path `self.next` was _not_ yet cleared, so the
   identical failing load would retry every 200ms tick for the rest of
   the crossfade window. Fixed by extracting a `load_and_play` helper and
   handling its `Result` explicitly at both call sites: EOS-recovery
   failure now reports `PlayerEvent::Error` and finishes gracefully
   (matching the existing no-next branch); crossfade-start failure
   reports the error, clears `next` once, and — since the _current_ track
   is still playing fine, only the preload failed — leaves it alone
   rather than stopping good audio, letting its own natural EOS report
   `PlaybackFinished` normally later. Also: `poll_events` was only ever
   called on `self.active`, so a real decode error on the slot being
   crossfaded _into_ would sit unread on its bus and never surface; now
   polled (for `Error` only) during an active crossfade too.
2. `set_playback_speed` only forwarded to `self.active`, unlike
   `set_muted`/`set_eq_band`, which explicitly apply to both slots "so a
   crossfade never audibly jumps." A speed change mid-crossfade left the
   outgoing and incoming tracks at different speeds for the rest of the
   transition. Fixed to match the sibling setters. Four new regression
   tests in `player.rs` plus test-only `SimulatedBackend` hooks
   (`fail_load_for_test`, `speed_for_test`, `push_error_for_test`) needed
   to reproduce failure/inspection scenarios the existing simulated
   backend couldn't otherwise trigger.

**`player-core`** — three real bugs:

1. **Data loss**: rename-detection matched a new file against the full
   `missing` list without excluding rows an earlier file in the same scan
   had already claimed. Two on-disk files sharing one content hash (e.g.
   a deleted track duplicated to two new paths) would both match the same
   now-missing row — the second `rename_track_path` call silently
   repointed the same row a second time, leaving the first file with no
   DB row at all and double-counting `summary.renamed`. Fixed by
   excluding `matched_missing_ids` from the search predicate, so a second
   duplicate correctly falls through to being inserted as a new track.
2. `Database::last_scanned_at` returned `Err(QueryReturnedNoRows)` instead
   of `Ok(None)` for a root not present in `scan_state`, unlike every
   sibling single-row lookup in the crate (all of which use
   `.optional()`). Not reachable from any current caller, but exactly the
   "looks fine until something finally calls it" shape this project has
   hit before (the original `is_playing()` bug). Fixed with `.optional()`
   - `Option::flatten` (the column is itself nullable, so there are two
     layers of optionality to collapse).
3. **Design gap in unshipped code**: `reorder_playlist` and (the
   since-renamed) `remove_track_from_playlist` keyed off `track_id`, but
   nothing in the schema prevents the same track appearing in a playlist
   twice — `playlist_tracks` has its own `id` primary key precisely for
   this reason, unused until now. A track added twice would have _both_
   occurrences moved/removed by any single reorder/remove call, making
   independent occurrences impossible to manage. Not yet reachable (no
   playlist UI exists before Phase 8), but fixed now rather than let
   Phase 8 build a drag-reorder UI on top of a known-broken foundation:
   `add_track_to_playlist` now returns the new row's own id,
   `reorder_playlist`/`remove_playlist_track` key off that id, and a new
   `playlist_track_rows` method exposes `(row_id, track_id)` pairs for
   callers that need to address a specific occurrence.

**Frontend** — three real bugs plus one off-by-one in code already being
touched:

1. **`Menu` never received keyboard focus on open**, so arrow-key
   navigation was completely dead until the user manually Tabbed or
   clicked into an item — a real, reachable break of the app's stated
   keyboard-first pillar in already-shipped code (e.g. Settings' theme
   picker). Fixed with a `useEffect` on `open` that focuses the first
   enabled item and restores focus to whatever was focused before on
   close, mirroring `Dialog.tsx`'s existing pattern one file over.
2. Same file, one-line off-by-one: `handleKeyDown`'s wrap-around formula
   handled "nothing focused yet" (`currentIndex === -1`) correctly for
   ArrowDown (lands on index 0) but not ArrowUp (landed on the
   second-to-last item instead of the last). Only reachable before fix
   #1 landed in practice, but fixed in the same pass since it was in code
   already being changed.
3. `Library.tsx`'s debounced search had no stale-response guard — the
   same race class just fixed in `playbackStore`. Typing "cat", pausing
   long enough to fire a search, then typing "s" before it resolved could
   show "cat"'s results if that reply arrived after "cats"'s, with
   nothing to correct it afterward. Fixed with the same `cancelled` flag
   pattern `LibraryContext.tsx`'s mount effect already used one file over.
4. `Queue.tsx` rendered the literal string `Track #${currentTrack.id}`
   instead of a real title — `currentTrack` from the playback store is
   just `{ id, uri }` with no display metadata, so anyone opening Queue
   while something played saw a raw internal id. Fixed by switching to
   `useNowPlaying()` (built in Phase 7, already used by
   `MiniPlayer`/`FullPlayer`), which resolves the same store value into a
   full `TrackListItem`.

**Noted but deliberately not fixed**: `Popover.tsx` only computes its
position once on open (no reposition on scroll/resize) and only clamps
the left edge, never the bottom — harmless today because its only live
consumer (Settings' theme `Dropdown`) sits near the top of a
non-scrolling section, but Phase 9's context menus will anchor `Popover`
all over the screen. Worth a flip/clamp pass during or right before that
phase rather than speculatively now.

**Every fix above shipped with a regression test verified against the bug
it fixes**, not just written to pass against the fixed code — each was
confirmed to fail on the pre-fix code (via `git stash` or a manual
temporary revert) before the fix was restored. New tests: 4 in
`audio-engine`'s `player.rs`, 1 in `player-core`'s `scan/mod.rs`, 1 in
`player-core`'s `db/scan_state.rs`, 1 in `player-core`'s
`db/playlists.rs`, 3 in `Menu.test.tsx`, 1 new `Library.test.tsx` (which
needed a hand-rolled `@tanstack/react-virtual` mock, since jsdom reports a
zero-size scroll container and the real virtualizer renders nothing at
all under that condition — worth remembering for any future test that
needs to assert on virtualized row _content_, not just row count).

## Phase 8: queue and playlists

**Queue vs. `Player::next`, kept deliberately distinct** — `audio-engine`'s
own doc comment already anticipated this split: `next` is a single
look-ahead slot for gapless/crossfade preloading; the real ordered
"what plays after this" list is `player-core`'s `queue` table plus the
frontend. Phase 8 is what actually wires that up. `queueStore.ts`
(Zustand) owns the persisted queue and is the only thing that calls
`player.setNext(...)` — it re-syncs the backend's `next` to the queue's
current head after every mutation, and `playbackStore` calls into it at
exactly two points: `consumeHead()` when a `TrackAdvanced` event reports
the backend consumed the armed `next` naturally (gapless/crossfade), and
`syncNext()` after `playNow`/`playPrevious` (which clear the backend's
`next` as a side effect of jumping straight to an arbitrary track, so it
needs re-arming from the still-intact queue). Both `queue` and
`playlist_tracks` rows carry their own `id`, separate from `track_id`,
specifically so a track can appear more than once and still be
independently reordered/removed — `playlist_tracks`' row-identity bug
fixed in the prior bug-hunt pass turned out to be exactly the schema
Phase 8 needed; `queue.rs` was built the same way from the start.

**Real Previous, not a fake placeholder**: `playbackStore` keeps an
in-memory-only `history: TrackRef[]` stack (capped at 50, not
persisted — resets on restart like most players' back button, since
persisting "what you just skipped past" isn't a real requirement here).
`playNow`/the `TrackAdvanced` handler push the outgoing track onto it;
`playPrevious` pops and replays without re-pushing what's being left —
that asymmetry matters: re-pushing would make repeated Previous presses
oscillate between two tracks instead of walking further back (caught by
a real regression test, `playbackStore.test.ts`'s "does not oscillate"
case). Previous never touches the persisted queue; it's a pure
convenience rewind, independent of the queue's forward-only progression.
`useNowPlaying` (Phase 7) now derives `hasNext`/`hasPrevious` from the
real queue/history instead of the library-sort-order fallback it
shipped with — that fallback is fully retired, not just superseded.

**UI**: `Queue.tsx` and the new `PlaylistDetail.tsx` share one
`SortableRow` component (`@dnd-kit/sortable` + a drag-handle affordance)
wrapping plain `MediaRow`s, rather than duplicating drag chrome per
view. `MediaRow` gained an optional `actions` prop (a "..." trigger
opening the existing `Menu` component) — Library rows use it for
"Play Next"/"Add to Queue"/"Add to Playlist…", intentionally reusing
Phase 1's `Menu`/`Popover` rather than building bespoke per-row UI;
Phase 9's shared context-menu component will likely absorb and expand
this rather than start from scratch. A new `ConfirmDialog` primitive
(spec §27/§40: destructive actions need a confirmation step) gates
playlist deletion from both the list and detail views. Playlist
"artwork" is deliberately scoped to the existing deterministic
placeholder-gradient system (`Artwork`'s seed hashing, unchanged) rather
than a custom image-upload flow — real artwork editing is Phase 10's
job, once the metadata-editor infrastructure exists to do it properly
rather than bolting on a one-off picker here.

**Real bug caught by on-device verification, not by any test**:
`Queue.tsx`'s top-level branch originally gated the entire "Up Next"
list on `!track` (nothing currently playing), so a genuinely non-empty
queue rendered the misleading "Queue is empty" empty state whenever
nothing happened to be playing yet — e.g. right after seeding a queue
before ever pressing play. Screenshotting the seeded-but-not-playing
state (the natural first thing to check) caught this immediately; no
unit test exercised "queue has items, nothing is playing" as a distinct
case from "queue and nothing playing are both empty." Fixed by gating
the empty state on `!track && items.length === 0` and making the
"Now Playing" card conditional on `track` independently of the list
below it.

**Second real bug, also on-device-only**: `PlaylistDetail`'s "playlist
was deleted elsewhere, go back" guard called `onBack()` (the parent
`Playlists` component's `setSelectedId(null)`) directly in the render
body, which React flags (`Cannot update a component while rendering a
different component`) — and it fired spuriously on every fresh app
launch, because `playlistsStore`'s own fetch hadn't resolved yet on the
very first render, making a playlist that genuinely exists briefly look
"not found." Both problems shared one fix: added a `playlistsLoading`
check so "still loading" and "genuinely gone" are distinguished, and
moved the `onBack()` call into a `useEffect` keyed on
`(playlistsLoading, summary)` — a parent's setState triggered by a
child observing external state belongs in an effect, never synchronously
in the render body. Caught only because verification actually opened
the detail view on a fresh launch rather than assuming the happy path;
worth remembering alongside Phase 6/7's similar lessons about what
seeding real data before screenshotting actually catches.

**Deliberately out of scope for this phase**: no dedicated component
tests for `Queue.tsx`/`Playlists.tsx`/`PlaylistDetail.tsx` themselves
(matching the Phase 7 precedent of testing the underlying hooks/stores,
not every presentational wrapper) — `queueStore`/`playlistsStore`/the
`playbackStore` history logic all have real regression coverage, and the
views were verified on-device with real seeded data (a scanned 4-track
library, a 2-item queue, a 2-track playlist with a description) via
screenshots rather than jsdom, since the two real bugs above were both
the kind jsdom-based component tests are unlikely to have caught
(one about a specific data-state combination, one about load-order
timing on a fresh launch).

## Phase 0 status

Scaffolding complete: workspace builds, typechecks, lints, formats, and
tests green across both the Rust workspace and the frontend. See
`PLAN.md` for phase-by-phase progress.
