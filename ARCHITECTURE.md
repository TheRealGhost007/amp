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

**Post-Phase-8 bug-hunt pass**: `queueStore.ts`'s `syncNextWithBackend` —
called after every queue mutation — let `player.setNext()`'s rejection
propagate unguarded. On a machine where the audio backend never
initialized (`audioUnavailable`, spec §27 — the app still runs without
one), every single queue action (add/remove/reorder/clear/...) would
throw an unhandled rejection, even though the mutation itself (a DB
write) had already succeeded. `playbackStore`'s `fetchFavoriteStatus`
already established the right precedent for exactly this shape —
swallow a best-effort, non-critical IPC failure rather than let it
propagate — `syncNextWithBackend` just hadn't followed it. Fixed with
the same try/catch; verified with a regression test (mocking
`player.setNext` to reject) confirmed to fail without the fix and pass
with it.

## Phase 9: command palette and context menus

**One shared context-menu builder, not per-view menus.** `lib/trackMenu.ts`'s
`buildTrackMenuItems(track, options)` is a plain function (not a hook —
called per-row inside a `.map()`) that assembles the full, contextually
correct entry list for any song row: Play, Play Next, Add to Queue, Add
to Playlist, Favorite/Unfavorite, View Artist (if the track has one),
View Album (if it has one), Copy Info, Open File Location, and Remove
From Library — reusing Phase 1's `Menu`/`Popover` rather than building
new menu UI. Every view that lists tracks (Library, Queue, playlist
detail, the new Favorites and Recently Played views, Artist/Album
detail) calls it, passing an `extraItems` list for whatever's specific
to that view (e.g. "Remove from Queue") and an `onRemovedFromLibrary`
callback so the calling view refreshes whatever it's displaying — there
is no single global cache this builder could refresh on every view's
behalf (Library's `LibraryContext`, `queueStore`, and a playlist
detail's local track list are all independent), so each view stays
responsible for its own refresh. Two new global, store-driven dialogs
(`addToPlaylistDialogStore`, `confirmDialogStore`) back the two actions
that need a dialog, each mounted exactly once (`Shell.tsx`'s new
`GlobalDialogs`) instead of every view owning its own dialog instance.

**"View Artist"/"View Album" needed real detail views to navigate to,
not just a menu label** — Phase 6 had explicitly deferred these
("Album tiles and Artist rows are display-only ... a better fit for
the album/artist detail pages a later phase should build"). Built
`ArtistDetail.tsx`/`AlbumDetail.tsx` now: both filter the already-loaded
`LibraryContext.tracks` client-side by the track's `artist_id`/
`album_id` (added to `TrackListItem` this phase — trivial columns
already on `tracks`, no new join needed) rather than adding new backend
queries, consistent with Phase 6's "fetch the whole list once" approach.
Navigating to one from anywhere (not just from inside Albums/Artists
itself) needed lifting view-switching out of `Shell.tsx`'s local
`useState` into a new `navigationStore` (Zustand) — `Playlists.tsx`'s
own detail-selection state stays view-local by contrast, since nothing
outside Playlists ever needs to jump straight to one.

**Command palette** (`palette/CommandPalette.tsx`, Ctrl+K): a static
navigation-command registry (from the existing `SIDEBAR_ITEMS` list)
plus live search over tracks (the Phase 6 FTS5 backend, debounced) and
client-side substring matches over albums/artists/playlists (already
loaded, so no new backend query for those three). No new dependency —
substring matching plus a short, curated per-group result list is
sufficient at this library scale; a real fuzzy-match algorithm can
replace it later without changing the surrounding structure if it ever
proves insufficient.

**New backend**: `TrackListItem` gained `artist_id`/`album_id` (needed
for View Artist/Album). `library_remove_track` (Remove From Library —
cascades to favorites/queue/playlist_tracks/playback_history via the
schema's existing `ON DELETE CASCADE`, so no extra frontend cleanup
queries are needed beyond each view refreshing its own visible list).
`history_record_played`/`history_list_recent` finally give the Phase 2
`playback_history` table a real caller — `playbackStore` records a play
on every `playNow`/`TrackAdvanced`, best-effort (a failed write must
never block playback, matching the `fetchFavoriteStatus`/
`syncNextWithBackend` precedent). `list_recently_played_for_browse` and
`search_tracks_for_browse` now share one `tracks_by_ids_in_order`
helper — both start from a ranked/ordered id list that a plain SQL
`ORDER BY` can't reproduce through an `IN (...)` clause, so both need
the same "join back, then re-sort in Rust to match the id list" fix.

**Deliberately out of scope for this phase**: no "Edit Metadata" menu
entry — Phase 10 owns the actual metadata-editor infrastructure
(validation, path-traversal checks against configured library roots
per spec §37, the destructive-write confirmation), and a menu entry
with nothing real to open would be exactly the kind of placeholder this
project's rules forbid. No bulk album/artist-level context menu (Play
whole album, queue whole album, ...) — Albums/Artists tiles gained real
click-through navigation instead of doing nothing (their actual prior
state), which is the more valuable and more clearly-in-scope fix; a
bulk-actions menu is a natural fast-follow once this phase's menu
infrastructure exists, not something the stated exit criteria
("every media row opens the same context-menu component") strictly
requires reading as covering non-song rows too.

**Real bug, reported live by the user while this phase was still being
verified, and root-caused via on-device screenshots**: `Popover.tsx`
(shared by every `Menu`) computed its position using
`window.innerWidth - 240` — a hardcoded guess at the menu's width, fine
for Phase 1's short dropdowns but wrong the moment Phase 9 put a
10-item, much wider menu behind it, so a menu opened near the right
edge could render mostly off-screen. This was already a documented,
accepted-for-now limitation from the Phase 8 bug-hunt pass, which
explicitly flagged it as needing a real fix "during Phase 9" once
context menus actually got used everywhere — this is that fix landing.
The real fix was two-layered: (1) `Popover.tsx` now measures the
content's _actual_ rendered size (`contentRef.current.getBoundingClientRect()`)
instead of assuming a fixed width, and clamps against real viewport
edges on all sides, with a bottom-edge flip-to-top fallback when there
isn't room below; (2) that measurement is only reliable because
`Popover.css` now sets `width: max-content` — without it, a freshly-
mounted popover measured _while still `position: static`_ (its state
before the positioning effect switches it to `fixed`) reports itself as
stretched to its containing block's full width (the viewport, since
it's portaled directly under `<body>`), not its real content width, so
even a "measure the real DOM" fix silently produces the same wrong
answer without the CSS half of the fix. Verified via the established
on-device screenshot technique (jsdom cannot catch a bug this
CSS-positioning-specific either, per the same lesson as every other
layout-only bug found this way in this project) — confirmed broken
before the fix (menu rendered flush against the window's left edge,
overlapping the sidebar) and correctly clamped within the viewport
after.

## Post-Phase-9 bug-hunt pass

Two real bugs found by re-reading the new Phase 9 code with fresh eyes.

1. **`AlbumDetail.tsx` sorted tracks by `track_number` alone**, ignoring
   `disc_number`. Harmless for a single-disc album, but a real multi-disc
   album would interleave incorrectly — disc 2 track 1 sorting before
   disc 1 track 5, since nothing broke the tie between two tracks that
   both happen to be numbered similarly on different discs. Fixed by
   sorting on `(disc_number, track_number)` instead of `track_number`
   alone.
2. **The command palette's playlist search results didn't actually open
   the matched playlist** — `onSelect: () => navigate("playlists")`
   always landed on the general playlists list, regardless of which
   playlist the user had just searched for and clicked. The underlying
   cause: `Playlists.tsx`'s "which playlist am I viewing" state was
   view-local (`useState`, following the same pattern as `Artists.tsx`
   _before_ this phase lifted artist-detail selection out for exactly
   this reason), so nothing outside `Playlists.tsx` had a way to say
   "open playlist X specifically." Fixed the same way View Artist/View
   Album were: added `playlistDetailId`/`viewPlaylist`/
   `backFromPlaylist` to `navigationStore`, migrated `Playlists.tsx` to
   read/write through the store instead of local state, and pointed the
   palette's playlist result at `viewPlaylist(playlist.id)`. Verified
   on-device (store-driven navigation isn't meaningfully different from
   the already-screenshotted View Artist/Album flows, so verification
   here checked that `Playlists.tsx` correctly renders `PlaylistDetail`
   when `navigationStore.playlistDetailId` is set from outside the
   view, which is the part that actually changed).

## Phase 10: metadata editor and artwork editing

**Writes tags by re-running the scan pipeline, not a parallel code
path.** `player-core/src/metadata_editor.rs`'s `update_track_metadata`
writes the new tag values to the file with `lofty`, then calls the
_same_ `scan::process_file` the directory walker uses (elevated from
private to `pub(crate)` for this) to re-derive the DB row exactly as a
fresh scan would. This was a deliberate DRY choice over hand-rolling a
second artist/album/genre `get_or_create` + artwork-cache path here:
the scanner is already the single source of truth for "what does this
file's tags mean for the DB," and any future change to that logic
(e.g. a new fallback rule) now automatically applies to edits too,
with no risk of the two paths drifting apart.

**Path-traversal defense (spec §37) canonicalizes before comparing.**
`validate_path_within_roots` resolves both the target track's path and
every configured scan root with `Path::canonicalize` before checking
`starts_with` — a raw string-prefix check on unresolved paths would
miss a symlink or `..`-relative escape. Rejection uses a dedicated
`Error::PathOutsideLibrary` (wire code `PATH_OUTSIDE_LIBRARY`) instead
of the generic `Internal` variant, so this specific, security-relevant
rejection stays identifiable at the IPC boundary rather than looking
like any other failure. Covered by a regression test that scans a
fixture, then removes its scan root (simulating a track whose library
folder was since unconfigured) and confirms the edit is rejected
without touching the file — and verified again on-device: deleting the
real scan row for a real scanned file and attempting a save through
the actual dialog produced the exact same rejection, with neither the
file nor the DB row touched.

**Artwork import sends a file path over IPC, not raw bytes.** The
frontend's "Change Artwork" picks a file with the native OS dialog
(`@tauri-apps/plugin-dialog`) and sends only the chosen path; the Rust
`metadata_update_track` command reads the bytes itself
(`std::fs::read`). This avoids shipping a base64-encoded image through
the Tauri IPC bridge, which would inflate a multi-MB cover image by a
third for no benefit — the backend has direct filesystem access
already.

**Artwork preview stays a placeholder, matching the rest of the app.**
No view anywhere in this app currently renders a track's real cached
artwork — every `MediaRow`/`Artwork` caller supplies only a `seed` for
the deterministic placeholder gradient, never a real `src` (confirmed
by grep before deciding this). Retrofitting real artwork-path plumbing
just for this one dialog's "current artwork" preview would be
new, unreviewed scope well beyond what Phase 10 asks for, so the
editor shows the same placeholder system for the track's current art.
A newly-_picked_ replacement file also stays a placeholder plus a
"New artwork: <filename>" note rather than a real image thumbnail —
rendering the actual picked file would need either the Tauri asset
protocol (a new filesystem-exposure scope decision belonging to a
security pass, not this dialog) or reading the file into a data URL on
the frontend via a filesystem plugin this project doesn't otherwise
depend on. Both are disproportionate to a cosmetic preview; the
filename note gives the same confirmation with neither cost.

**`TrackListItem` was missing `album_artist`.** Every other editable
field (title/artist/album/genre/track/disc/year) already had a
frontend-visible column, but album artist — needed so the editor can
show and let the user change it — had only ever been threaded through
the internal `Track`/`NewTrack` structs, never the joined, browse-facing
`TrackListItem`. Added the column to the struct, the `TRACK_LIST_ITEM_COLUMNS`
SQL list, and `row_to_track_list_item_offset` (shifting every
subsequent field's offset by one, the same mechanical change Phase 9
made when `artist_id`/`album_id` were added) plus the matching
TypeScript interface and test fixtures — a reminder that a new
feature's data needs are worth checking against _all_ of a type's
existing consumers, not just the ones the new feature touches directly.

**A real focus-stealing bug, caught only by the dialog's own Vitest
test, not by hand-testing.** `MetadataEditDialog`'s `handleClose` was a
plain function defined fresh every render; passed as `Dialog`'s
`onClose` prop, its changing identity re-ran `Dialog`'s focus-trap
`useEffect` (which depends on `[open, onClose]`) on every keystroke in
any field — each re-run's cleanup returned focus to whatever was
focused before the dialog opened, then its setup immediately moved
focus to the panel's first focusable element (the header's close
button), so only a field's _first_ typed character ever landed;
everything after silently went nowhere. Every other dialog in this app
(`AddToPlaylistDialog`, `ConfirmDialog`) passes a stable, store-owned
`close` action straight through as `onClose` and never hit this,
which is exactly why nothing surfaced it before — this dialog was the
first to wrap `onClose` in a local closure (to guard against closing
mid-save). Fixed by wrapping it in `useCallback` keyed on `[saving,
onClose]`. A Vitest test simulating real typing (`userEvent.type`)
caught this immediately, by asserting the full string reached the
saved payload — this is the value of testing dialogs through actual
user interaction rather than only asserting on state after a single
`fireEvent.change`.

**Verified on-device end to end**, not just via tests: scanned a real
tagged MP3 fixture into the live app's actual database, opened the
real dialog (forced via a temporary store-default hardcode, the
established technique for state that has no clickable path to force
through native-dialog-heavy flows — reverted before commit), edited
the title through real keystrokes, confirmed the destructive-action
warning, and verified both the file's tag (`ffprobe`) and the DB row
changed, with a success toast and the dialog closing. Then removed the
fixture's scan root and repeated the save to confirm the path-outside-
library rejection fires for real, with neither the file nor the DB
touched, and the exact `PATH_OUTSIDE_LIBRARY` message surfaced as an
error toast.

## Phase 11: Linux/Omarchy integration (MPRIS, media keys, notifications)

**"Media-key capture" turned out to need no capture code at all.**
Investigated Omarchy's actual media-key handling before writing anything:
Hyprland's default keybinds (`/usr/share/omarchy/default/hypr/bindings/media.lua`)
route `XF86Audio{Play,Pause,Next,Prev}` through `omarchy-shell media
<action>`, which forwards to Quickshell's built-in `Quickshell.Services.Mpris`
module — Omarchy's shell already discovers and controls _any_ MPRIS
player on the session bus. A Wayland client can't grab global hotkeys
directly anyway (no compositor protocol for it here), and this
confirms the whole app doesn't need to — implementing MPRIS correctly
_is_ "media key capture" for this desktop. Verified for real: once the
service was running, Quickshell's own top-bar media widget picked it
up and displayed/controlled it with zero app-side key-binding code.

**MPRIS via `mpris-server`'s `Send`-safe `Server`/`RootInterface`/
`PlayerInterface` traits, backed by `Arc<Mutex<...>>`, running on
`src-tauri`'s existing `tauri::async_runtime` — not the crate's
`!Send`, `Rc`-based `Player` convenience type.** This was a deliberate
architecture change made _during_ this phase after hitting a real,
fully-reproduced bug with the original design (see below); it is not
how the phase started. `MprisHandle::update(snapshot)` diffs against
cached values and only calls `Server::properties_changed` for fields
that actually changed, avoiding D-Bus chatter on every 200ms tick;
`Position` is deliberately _not_ one of those fields (MPRIS spec:
clients poll it, no `PropertiesChanged` signal) — it's a plain
`Mutex`-guarded field read directly by the `position()` getter.
`Next`/`Previous` are forwarded to the frontend as a `mpris-transport`
Tauri event rather than handled in Rust at all, since the actual
queue/play-history they need lives only in `queueStore`/
`playbackStore.history` (Zustand) — `audio_engine::Player` has no
concept of a queue, only a single look-ahead slot, and neither crate
should grow one just for this. Play/Pause/Stop/Seek/SetVolume act
directly on the same `Player` every other command path uses, and go
through a new shared `emit_player_events` helper so an MPRIS-initiated
change reaches the frontend's own UI (mini-player, Quickshell's widget)
immediately via the existing `player-event` channel — without it, a
`playerctl pause` would pause real audio while the in-app UI kept
showing a playing state until the next natural event, breaking Phase
7's "one source of truth" invariant for exactly this new input source.

**A real, fully-reproduced bug drove a mid-phase architecture change:**
the first implementation used `mpris-server`'s ready-made `Player`
(`!Send`, `Rc`-based), which requires its own dedicated OS thread
running a single-threaded Tokio runtime + `LocalSet` (it can't share a
multi-threaded runtime). This worked perfectly in isolation — a
standalone repro with the exact same thread/channel/diff-check
structure passed cleanly — but broke _silently_ the moment a real
`playbin3`/`pipewiresink` pipeline in the same process reached the
`Playing` state: `apply_snapshot`'s own same-task readback confirmed
`player.set_playback_status()`/`set_metadata()` succeeded every single
tick, yet `busctl get-property`/`playerctl` from _outside_ the process
kept reading the stale initial values (`Stopped`, empty metadata)
indefinitely, with zero errors logged anywhere. Root-caused via a
sequence of minimal standalone reproductions (not guesswork): the
bug did _not_ reproduce with `gstreamer::init()` alone, nor with a
`GstreamerBackend` merely constructed, nor with a loaded-and-paused
(prerolled but not streaming) pipeline — only an _actively streaming_
`play_now()` reproduced it, isolating the trigger precisely to "a real
GStreamer audio pipeline streaming in the same process as the
dedicated MPRIS thread's manually-polled `LocalSet`." Rather than work
around a not-fully-understood interaction between two separate
runtimes/threads sharing a process with an active real-time audio
pipeline, the fix was to remove the failure-prone mechanism entirely:
`mpris-server` also exposes `Send + Sync`-bound `RootInterface`/
`PlayerInterface` traits usable with the plain `Server` type, which
needs no dedicated thread, no `LocalSet`, and no manual polling loop —
zbus drives it via the same connection-owned executor task any other
zbus interface uses, identical to how the rest of this app's D-Bus-free
code already coexists with GStreamer without issue. Verified the fix
by reproducing the exact broken scenario again (real playback, `busctl`
polling mid-stream) and confirming `PlaybackStatus`/`Metadata`/
`Position`/`CanGoNext` all now update correctly, live, throughout
playback — plus a full playerctl-equivalent control loop (`Play`,
`Pause`, `Seek` including the past-end-of-track edge case correctly
falling through to natural EOS) and a real track-change notification
carrying a genuine resolved artwork path, all captured via
`dbus-monitor` and `busctl` rather than assumed from log output alone.

**Artwork path resolution needed a new read-side function, not just
Phase 3's write side.** `player_core::track_artwork_path(cache_dir,
&track)` recomputes the same `track-<hash>` cache key
`scan::process_file` already writes under and globs the artwork cache
directory for a matching file of any extension — the extension itself
was never stored anywhere queryable, only baked into the cached
filename, so a glob-by-stem is simpler and more robust than trying to
also persist/track the extension. Used by both MPRIS's metadata and
the track-change notification's icon, sharing one lookup rather than
two.

**`NowPlayingTracker`** (`src-tauri/src/mpris.rs`) caches the current
track's display fields (title/artist/album/artwork) so the 200ms tick
loop only hits the database when the track id actually changes, not
every tick; `refresh_if_changed` returns `true` only on a genuine
`None`/`Some(other)` → `Some(new)` transition, since a `Some → None`
(playback stopped) is a real state change worth clearing the cache for
but not one worth a "now playing" notification. This is `src-tauri`'s
first-ever unit-tested module — deliberately: unlike the rest of this
layer's "thin pass-through" commands, this dedup/caching logic has real
branching behavior worth verifying directly (an in-memory `Database` +
inserted fake tracks, no D-Bus/GStreamer needed).

**Desktop notifications via `notify-rust`**, gated by a new
`notifications.track_change_enabled` setting (default on, added to
Settings > Notifications with a new `Toggle` component — the app's
first boolean settings control, following the same `settings.get/set`
key-value pattern as the existing theme dropdown). `Notification::icon()`
accepts either a themed icon name or an absolute file path per its own
docs, so the resolved artwork path (or a generic `audio-x-generic`
fallback) is passed directly — no need for the heavier `image()`/
`Hint::ImageData` API. Fired from the same tick-loop choke point that
builds the MPRIS snapshot, exactly once per genuine track change,
regardless of what caused it.

**PipeWire device list feeding the device switcher**: already real as
of Phase 4 (`GstreamerBackend::enumerate_output_devices` uses
GStreamer's own `DeviceMonitor` against `Audio/Sink`, backed by the
PipeWire GStreamer plugin) — this phase only needed to confirm it,
which it did (device enumeration still returns the real system sink
during this phase's testing); this environment has only one audio
output device available, so the specific "switching between two real
devices doesn't interrupt playback" check — like the spec's own
"if available" phrasing acknowledges — couldn't be exercised live and
is deferred to whenever a second device is on hand.

**Verified fully on-device**, end to end, not from logs or assumptions:
scanned two real tagged fixtures (one with embedded artwork) into the
live app's database, force-played one via a temporary store-default
hardcode (reverted before commit), and confirmed via `busctl`/
`dbus-monitor` — separate processes from the app itself, exactly like a
real MPRIS client — that: the service registers as
`org.mpris.MediaPlayer2.amp`; `PlaybackStatus`/`Metadata` (including
`mpris:artUrl`)/`Position`/`CanGoNext` all track real playback live;
`Play`/`Pause`/`Seek` D-Bus calls actually control the real audio
pipeline; a seek past a track's end correctly falls through to the
existing natural-EOS handling; and a `Notify` D-Bus call fires with the
correct title/subtitle/icon on every track change, including a real
resolved artwork file path for the embedded-art fixture.

## Post-Phase-11 bug-hunt pass

Two real bugs found re-reading the new MPRIS/notification code with
fresh eyes.

1. **A track removed from the library while it's the one actually
   playing made MPRIS look like nothing was playing.**
   `NowPlayingTracker::refresh_if_changed` looked up the new track's
   display fields via `Database::get_track_for_browse`/`get_track`,
   and on a lookup failure (row gone — a real case, "Remove From
   Library" already works on the currently-playing track; also any
   transient DB error) fell back to `self.cached = None`. That made the
   MPRIS snapshot report `track_id: None` and empty `Metadata` while
   `PlaybackStatus` still correctly said `Playing` (computed separately,
   straight from `audio_engine::Player`, which has no idea the DB row
   is gone) — an external MPRIS client would see "Playing" with no
   track info at all, and the app's own notification logic would
   silently skip firing. Fixed by falling back to a synthetic
   `CachedTrack` (`title: "Unknown Track"`, id preserved) instead of
   `None` whenever a `Some(track_id)` fails to load — the snapshot now
   stays internally consistent (a real track id, a real `Playing`
   status, and a generic fallback title) rather than contradicting
   itself. Caught with a regression test that requests a `track_id`
   the in-memory `Database` never had and asserts the snapshot still
   carries that id.
2. **`MprisHandle::update`'s fire-and-forget `tokio::spawn` per tick had
   no ordering guarantee** — the exact class of bug already fixed once
   in this codebase for `playbackStore`'s track/favorite updates (see
   the Phase 7 section above), just on the Rust side this time. Since
   `apply_snapshot` runs in an independently-scheduled task per call on
   a multi-threaded runtime, a slower, now-superseded snapshot
   completing _after_ a newer one could overwrite fresher
   status/metadata/volume with stale data. No reproduction of this one
   was ever actually observed live (ticks are 200ms apart and
   `apply_snapshot`'s own work is small, so a real reordering is rare),
   but the failure mode — an external MPRIS client transiently showing
   wrong Playing/Paused or stale metadata — is exactly the shape this
   project has already hit and fixed once, so it was worth closing
   defensively rather than waiting to reproduce it under load. Fixed
   with the same technique as the frontend fix: a monotonic sequence
   number assigned at `update()`-call time (not inside the spawned
   task), with `apply_snapshot` dropping anything not strictly newer
   than the last-applied sequence. The comparison itself
   (`is_stale`) is a two-line pure function, unit-tested directly.

## Phase 12: keyboard shortcuts, accessibility, settings

**Global shortcut manager**: a single `document`-level `keydown` listener
(`src/keyboard/GlobalShortcuts.tsx`), not per-component ad-hoc listeners,
dispatching via a lookup table (`ShortcutId → () => void`) against a
persisted, rebindable bindings store (`useKeyboardShortcutsStore`,
`src/store/keyboardShortcutsStore.ts` — same `settings.get/set` key-value
pattern as every other persisted preference in this app, key
`keyboard.bindings`). Two guards run before dispatch: `e.defaultPrevented`
skips the event if a more specific component already claimed it, and a
bare-letter/Shift+letter combo is suppressed while `document.activeElement`
is a text-editable element (`isEditableElement` in `src/keyboard/
shortcuts.ts`) so typing in a search box or the metadata editor doesn't
trigger transport controls; Ctrl/Alt/Meta-modified combos always fire
(`hasHardModifier`) since those essentially never produce printable
characters. The `defaultPrevented` guard relies on DOM event-bubble
ordering: React's synthetic handlers attach to the root container, a
`document` descendant, so they run before a native `document`-level
listener in the bubble phase — verified with a dedicated test that
registers a real `preventDefault()`-calling listener ahead of
`GlobalShortcuts`, not assumed from spec knowledge alone, since jsdom/
Testing Library's `fireEvent` can't set `defaultPrevented` through its
event-init object (it's a derived, read-only `Event` property — the
test has to call a real `.preventDefault()`).

**Key mapping** (`src/keyboard/shortcuts.ts`, `SHORTCUT_DEFS`): Space
(play/pause), ArrowLeft/Right (seek ±10s), ArrowUp/Down (volume ±10%),
N/P (next/previous track), F (toggle favorite), Ctrl+K (command palette,
already existed as a hardcoded listener in `CommandPalette.tsx` — moved
into this table so it participates in the same conflict/rebind system
as everything else), L/Q (go to Library/Queue), Shift+P (go to
Playlists — deliberately disambiguated from bare P = previous-track,
following the master plan's own "L/Q/F/N/P/Shift+P" grouping), and
Escape (close the full-player overlay). Escape's _rebindable_ action is
specifically "collapse full player" — every pre-existing per-component
Escape-to-dismiss behavior (dialogs, menus, popovers) is left as a fixed
WAI-ARIA convention, not user-rebindable, since remapping "Escape closes
a modal" would be actively hostile to accessibility rather than a
customization.

**Reaching state outside the React tree**: `PlayerDock`'s local
`expanded` boolean was lifted into a new `usePlayerViewStore` (Zustand)
so `GlobalShortcuts`'s Escape handler can call `usePlayerViewStore
.getState().collapse()` from outside any component — the same pattern
already used for `navigationStore` (Phase 9) and the dialog stores
(Phase 9/10), reused rather than inventing a new mechanism.
`FullPlayer.tsx`'s own local Escape-key effect was removed now that this
is centralized.

**Settings UI** (spec §23) filled in four previously-stub sections:

- **Playback**: crossfade toggle + duration slider (1000–12000ms).
- **Library**: scan-roots list with per-root Remove, "Add Folder…"
  (reuses `useLibrary().addFolder()`, already real since Phase 3).
- **Audio**: output-device dropdown (finally wired to
  `player.listDevices`, real since Phase 4 but never surfaced in any UI
  until now) and a 10-band EQ. The EQ is laid out as horizontal slider
  rows rather than vertical faders — a deliberate layout simplification
  (vertical range inputs have inconsistent, hard-to-restyle track/thumb
  geometry cross-toolkit, and WebKitGTK is this app's only real target)
  documented here as a pragmatic scope call, not a functional cut: all
  10 bands, -24..+12dB range, still fully present and persisted.
- **Keyboard**: full rebind UI (`KeyboardShortcutsSettings.tsx`), grouped
  by Playback/Navigation/General, each row showing its current binding
  as a `kbd`-styled chip with "Change" (captures the next keydown via a
  capturing-phase listener, Escape cancels, a taken combo shows a toast
  and leaves the binding unchanged) and "Reset", plus a page-level
  "Reset all to defaults."

New shared module `src/lib/audioPreferences.ts` centralizes the
setting keys for output device / EQ bands / crossfade duration and an
`applyStoredAudioPreferences()` called once from `App.tsx`'s init effect,
since three independent new Settings sections all need to push their
persisted value to the audio engine at startup, not just when the user
touches the control.

"Advanced" (cache management, DB tools, logs, debug mode) is left as the
sole remaining "upcoming" section — explicitly noted in the UI as
deferred because there is no backend support for any of it yet (nothing
to clear, inspect, or toggle), unlike the four sections above which all
had real backend commands already sitting unused.

**Accessibility pass** found and fixed two real, calculated contrast
failures rather than eyeballing them:

1. `Toggle`'s "on" thumb (`#fff` fill on the theme's `--accent`
   background) — computing WCAG 1.4.11's relative-luminance contrast
   ratio by hand for both shipped themes: the dark theme's
   `--accent: #e68e0d` against white comes out to ~2.68:1, below the
   3:1 minimum for non-text UI components; the light theme's
   `--accent: #a3550a` passes at ~5.44:1. Since the failure is
   theme-dependent (any future/custom accent color could fail the same
   way) rather than fixing per-theme colors, the fix adds a fixed
   `box-shadow: 0 1px 3px rgba(0,0,0,0.5)` to the thumb — a real dark
   boundary that keeps the thumb's edge (and therefore its position)
   visible against the track regardless of the exact fill/background
   contrast underneath.
2. `CommandPalette`'s search input suppresses its own focus outline for
   a borderless look, but had never grown a replacement focus
   indicator — a real WCAG 2.4.7 gap, not just a nice-to-have. Fixed
   with a `:focus-within` border-bottom on the row (color + width
   change together, not a hue shift alone, per spec §18/§30's
   never-color-only-focus-indicator rule).

**Critical bug found during this phase's own on-device verification:
a full app crash on any frontend-initiated seek while MPRIS was live.**
Pressing the new ArrowRight seek shortcut produced a real Omarchy
"Process crashed" desktop notification and a genuine process abort —
not a recoverable panic — with the exact log text `thread 'tokio-
runtime-worker' panicked ... there is no reactor running, must be
called from the context of a Tokio 1.x runtime ... thread caused
non-unwinding panic. aborting.` Root-caused to the exact line:
`MprisHandle::notify_seeked` (`crates/linux-integration/src/mpris.rs`)
called the bare `tokio::spawn` free function, which requires the
calling thread to already be inside a Tokio runtime worker's own
ambient thread-local context — true for the tick loop's own task, but
not true for a synchronous (non-`async fn`) `#[tauri::command]`, which
Tauri dispatches on a plain thread-pool thread with no such context.
`player_seek` (a synchronous command) calling `notify_seeked` hit this
directly. This bug was latent since Phase 11 — the vulnerable code path
existed since that phase's `notify_seeked` was written — but escaped
Phase 11's own on-device verification because that verification only
ever drove seeks _from_ MPRIS (via `busctl`), which runs on a task
already inside the runtime; a frontend-initiated seek while MPRIS was
live was never exercised until this phase's keyboard-shortcut testing
did it by accident. Fixed by capturing a `tokio::runtime::Handle` once,
at `MprisHandle::spawn()` time (a context guaranteed to have an active
runtime), storing it on the `Clone`-able `MprisHandle`, and calling
`self.handle.spawn(...)` instead of the free function in both
`update()` and `notify_seeked()` — a `Handle` carries its runtime
reference directly rather than relying on ambient thread-local state,
so it can be spawned from any thread, sync or async, that holds a
clone of it. This keeps the `linux-integration` crate's
never-depend-on-`tauri` boundary intact: `tokio::runtime::Handle` is a
plain Tokio type, not a Tauri one. Verified the fix by relaunching,
confirming the same process PID survived multiple consecutive
ArrowRight/ArrowLeft/ArrowUp presses with zero new panic log lines
(cross-checked against the pre-fix crash notification, which was
confirmed stale rather than recurring). **General lesson beyond this
app**: `tokio::spawn` silently assumes ambient runtime context that a
synchronous FFI/plugin-dispatched callback (a Tauri sync command here,
but the same shape applies to any callback invoked by non-Tokio-aware
host code — a C callback, a GUI toolkit's dispatch thread, etc.) does
not have; any code that might be invoked from such a context should
capture and store a `Handle` up front rather than calling the free
function and assuming a runtime is present.

**Verified fully on-device**, keyboard-only, not from tests alone:
every shortcut in the mapping above fires correctly and respects the
text-input guard; Settings > Keyboard's rebind flow (click "Change" via
Tab+Enter, press a new key, see it persist as the new chip with a
"Reset" button appearing) and conflict detection (rebinding to an
already-used combo shows a toast naming the conflicting shortcut and
leaves the original binding untouched) both work reached purely via Tab
navigation; Settings > Playback/Library/Audio all render their real
controls (crossfade toggle, scan-roots list, device dropdown, 10-band
EQ) correctly end to end.

## Phase 13: performance hardening

Audit-first, not fix-first: most of this phase was verifying specific,
falsifiable claims (does X actually happen, is Y actually a cost) before
touching any code, and only two of the checks below turned up something
real enough to change. Two real fixes landed; everything else is an
audit result — either "already fine, here's the evidence" or "known,
already-documented tradeoff, re-confirmed still correct."

**Real fix #1 — the artwork disk cache had no bound at all, in either
direction tracks leave the library.** `Database::delete_track` only ever
deleted the DB row; nothing, anywhere, ever deleted the cached artwork
file a removed track had written under `<cache_dir>/artwork/`. Two
distinct call sites hit this: a rescan noticing a file is simply gone
(`scan_root`'s `missing` loop), and the "Remove From Library" context-
menu command. Worse, `Database::remove_scan_root` (the new Settings >
Library "Remove" button from Phase 12) only ever stopped a folder from
being _rescanned_ — every track it had already contributed to the
library stayed in the DB and in every browse view forever, orphaned
from any root, with its artwork cache file permanently unreachable
(there is no other path that would ever notice these tracks again,
since the root that used to own them no longer exists to be rescanned).
For a large library, both of these are genuine unbounded growth: an
artwork cache that only ever grows, and phantom library rows a user
explicitly asked to remove that never actually go away.

Fixed with two new `player-core` functions rather than patching each
call site ad hoc:

- `remove_cached_artwork(cache_dir, content_hash, path)` — derives the
  same `track-<hash>` cache key `process_file` writes under (extracted
  into a shared `artwork_cache_key` helper so the write side and both
  read/delete sides can never drift apart) and removes the matching
  file, best-effort. Wired into both of `delete_track`'s call sites
  (`scan_root`'s deletion loop and `library_remove_track`).
- `remove_scan_root_and_its_tracks(db, cache_dir, root_path)` — the real
  implementation behind "Remove" in Settings > Library now. Uses the
  exact same `tracks_for_scan_diff` prefix match `scan_root` itself uses
  to decide what belongs to a root, so "everything this deletes" is
  precisely "everything a rescan of this same root would still
  recognize as its own." Deletes each track's cached artwork, its
  search-index entry, and the row itself (favorites/playlist_tracks/
  queue/playback_history all cascade via their existing `ON DELETE
CASCADE` foreign keys), then removes the root registration — all
  inside one transaction, for the same reason `scan_root` itself uses
  one: an interrupted partial removal would be worse than either
  finishing or rolling back.

Five new regression tests, each confirmed to fail against a reverted
(no-op) version of its fix before being confirmed to pass against the
real one: cache-file deletion in isolation, isolation from an unrelated
track's cache entry, a no-op on a missing cache dir, an end-to-end
scan-detects-deletion-then-cache-file-is-gone test (using folder art
since the existing `build_wav` test fixture doesn't embed real tag
art), and both a same-root and cross-root case for
`remove_scan_root_and_its_tracks`.

**Real fix #2 — the playback tick loop did unconditional, wasted 200ms-
forever background work.** Two separate things, found together while
auditing `spawn_player_tick_loop` for "polling loops / redundant IPC
calls" (this phase's own exit-criteria wording):

1. `player-position` was emitted to the frontend every single tick
   regardless of playback state. Position only ever _changes_ while
   actually playing, so a paused or fully idle (no track loaded) app
   kept serializing and posting an identical IPC payload to the webview
   5 times a second, forever, for as long as the app stayed open — for
   no visible effect, since Zustand's selector equality check already
   silently absorbed the resulting no-op `set()` calls on the frontend
   side; the waste was entirely on the Rust/IPC side. Fixed by gating
   the emit on `player.is_playing()`. Verified this doesn't lose any
   real update: a paused seek already updates `positionMs` directly
   through the `seek()` store action (independent of the tick loop), a
   fresh `playNow` sets `isPlaying: true` before the next tick fires, and
   grepping confirmed `playbackStore` is the _only_ consumer of the
   `player-position` event anywhere in the frontend.
2. `Database::default_cache_dir()` (an XDG-path/`ProjectDirs` lookup)
   was called fresh on every tick whenever MPRIS is active — a value
   that's invariant for the entire life of the process. Hoisted out of
   the loop to be computed once at `spawn_player_tick_loop` startup
   instead of 5 times a second forever.

No regression test for either — this is `src-tauri`'s tick-loop
plumbing, which (per its own established convention, see
`NowPlayingTracker`'s doc comment from Phase 11) is intentionally
untested glue rather than logic; both changes were verified by reading
every consumer of the affected event, not by guessing.

**Audited and confirmed already correct, no change made:**

- **React re-render discipline.** Grepped every Zustand store for a
  whole-store subscription (`useXStore()` with no selector) — none
  exist; every call site already selects the narrowest slice it needs,
  the discipline established in Phase 5 and never violated since.
  `positionMs`/`durationMs` (the only state that changes every tick) are
  subscribed to by exactly two components, `MiniPlayer` and
  `FullPlayer` — both small, self-contained trees with no virtualized-
  list descendants, so a 5×/second re-render there is cheap and
  expected, not a jank source. `useNowPlaying` (shared by both) doesn't
  itself select position, so it doesn't re-run on every tick either.
- **Scan already runs off the UI/tick-loop thread.** `library_add_folder`
  wraps `scan_root` in `tauri::async_runtime::spawn_blocking`, confirmed
  by reading the command, not assumed from its doc comment.
- **Debounce values are already reasonable.** Library search: 200ms.
  Command palette search: 150ms. Both pre-existing, no change needed.
- **List virtualization matches actual scale, not just library size.**
  Library/Albums/Artists/Favorites/RecentlyPlayed (the views that scale
  with total library size) all already use `@tanstack/react-virtual`
  since Phases 6 and 9. Queue/Playlists/AlbumDetail/ArtistDetail don't
  — confirmed this is a reasonable scope decision rather than a gap by
  checking whether any bulk "select all → add to playlist/queue"
  feature exists (it doesn't; tracks can only be added one at a time via
  context menu or drag), which structurally bounds these views to at
  most a few hundred items in realistic use, never library scale.
- **50k-track scan throughput has not regressed.** Re-ran the existing
  `#[ignore]`d 50k-file fixture test. First measurement (13.7s, `cargo
test` debug profile) looked like a possible regression against the
  historical 7.9s baseline — but that baseline was always a `--release`
  number (the test's own doc comment says so) and the debug-mode run
  was never a fair comparison. Re-ran with `--release`: **5.45s**,
  actually faster than the historical figure, not slower. Lesson for
  next time: check what build profile a historical timing claim was
  measured under before treating a new number as a regression.
- **Artwork "in-memory bound" is moot for now, not skipped.** No view
  anywhere in the app currently renders a track's real cached artwork —
  every `Artwork`/`MediaRow` caller supplies only a `seed` for the
  deterministic placeholder gradient (confirmed by grep: zero call sites
  pass a real `src`). This was already deliberately deferred in Phase
  10's own writeup (real artwork display needs a Tauri asset-protocol
  filesystem-exposure decision that belongs to Phase 16's security
  pass, not a UI phase). Since no image is ever actually loaded, there
  is currently nothing for an in-memory cache to bound — re-confirmed
  the decision still holds rather than re-litigating it.

**Startup time and memory, measured on this machine, not assumed:**
built a real production binary (`npx tauri build --no-bundle` — a plain
`cargo build --release` does _not_ embed `frontendDist`; that only
happens via the `custom-protocol` feature the Tauri CLI enables, so an
early attempt at this measurement silently loaded `http://localhost:1420`
instead and failed with "Connection refused" once the dev server wasn't
running — worth remembering for next time this needs re-measuring).
Launched the resulting binary cold and timed from process exec to its
window registering with Hyprland (`hyprctl clients`, matching on window
class): **378ms**. RSS after startup: **~200MB**, most of which is
WebKitGTK's own engine overhead shared by any app built on it, not
specific to this app's code — consistent with the same ballpark seen in
this machine's other WebKitGTK/Tauri sibling projects. Both numbers are
comfortably within reasonable bounds for a native-feeling desktop app;
neither warranted further work this phase.

## Full-codebase bug-hunt pass (user-requested, between Phases 13 and 14)

Two real, user-reported bugs (the favorites heart icon, the collapsed
sidebar not fitting the same way its nav icons do) triggered a
user-requested full sweep of the whole codebase, not just the area those
two bugs were in — "I want no bugs in this." Split across four parallel
research agents by subsystem (`player-core`; `audio-engine`+
`linux-integration`+`src-tauri`; frontend state/stores; frontend UI/
components), each read-only and reporting only concrete, traced failure
scenarios — the same discipline as the Phase 7 full-codebase pass.
Combined, they reported 17 findings; 13 were fixed here, each with a
regression test confirmed to fail against a reverted version of its fix
(the two exceptions are noted below). 4 were deliberately deferred with
reasoning, not silently dropped.

**The two originally-reported bugs, found and fixed:**

1. **The favorites heart icon was genuinely lopsided, not a rendering
   glitch.** `Icon.tsx`'s `heart`/`heart-filled` SVG path data (both
   variants shared the identical path) was not actually symmetric about
   the viewBox's center — walking the coordinates, the left lobe reached
   roughly twice as far from center as the right one. Every heart
   anywhere in the app (every track row via `MediaRow`, `MiniPlayer`,
   `FullPlayer`, the Favorites empty state) rendered the same crooked
   shape. Replaced with a path whose control points are exact mirrors
   (`24 - x` of each other) about `x = 12`.
2. **The collapsed sidebar's header toggle wasn't centered the way the
   nav icons below it are.** `.op-sidebar__item` already had a
   `.op-sidebar--collapsed` override centering it and zeroing its
   padding; `.op-sidebar__header` (home to the collapse-toggle button)
   had no equivalent override, so it kept the expanded state's
   `justify-content: space-between` and horizontal padding even with
   the brand text gone — the toggle sat off-center relative to the nav
   icons beneath it instead of matching their centered treatment.

**Data-integrity bugs in `player-core` (the most severe findings):** 3. **Scan-root path matching used a bare string prefix, not a real path-
component boundary.** `tracks_for_scan_diff`'s `LIKE '<prefix>%'`
would also match a sibling path that merely starts with the same
characters — root `/home/user/Music` incorrectly matching every
track under an unrelated `/home/user/MusicOld/...`. This function
backs both `scan_root`'s own diffing (a rescan of one root could
silently delete an unrelated sibling root's tracks and cached
artwork) and Phase 13's `remove_scan_root_and_its_tracks` (removing
one root could delete another's tracks outright). Fixed by requiring
the character immediately after the root to be `/` (or the path to
equal the root exactly): `WHERE path = ?1 OR path LIKE ?2` with the
pattern built as `<trimmed-root>/%`. 4. **`get_or_create_album` created a duplicate row every time for any
album with no artist tag.** SQL treats `NULL` as distinct from `NULL`
for `UNIQUE(title, artist_id)` conflict purposes, so `ON CONFLICT DO
   NOTHING` never fired when `artist_id` was `None` — common for
compilations/"Various Artists" folders. Every file scanned under the
same untagged-artist album title inserted a brand-new row instead of
reusing the first, splitting one real album across multiple entries
in Browse. Fixed by checking for an existing row explicitly first
(`IS`, NULL-safe unlike `=`) instead of relying on `ON CONFLICT`. 5. **Retagging or removing a track's last reference to an artist/album/
genre left that row behind forever.** Nothing in the crate ever
deleted an `artists`/`albums`/`genres` row once its last track moved
away from it (`update_track`) or was deleted (`delete_track`) — they
accumulated as permanent zero-track "ghost" entries, visible forever
in Browse's `LEFT JOIN`-based listings. Fixed with a new
`gc_orphaned_taxonomy` helper, called from both `update_track` (using
the row's pre-update values) and `delete_track` (using its values
before the delete), that removes each of the three only if no track
references it anymore — safe to call unconditionally, since a
still-current id is still referenced by the row that was just
written.

**Frontend state races — the same "unguarded IPC reorder" shape already
fixed once in `playbackStore` (Phase 7), found unfixed in every other
store that does `await someIpcCall(); set(...)`:** Tauri dispatches
non-async commands across a thread pool, so two overlapping calls to the
same store method are not guaranteed to resolve in call order; a
slower, now-superseded reply landing after a faster, newer one can
silently overwrite correct state with stale state. 6. `favoritesStore.toggle` — double-clicking a heart fast enough could
leave the displayed favorite state opposite to the real backend
state. Fixed with a per-track sequence guard (not one global counter,
since toggling track A must never invalidate a concurrent, unrelated
toggle of track B). 7. `queueStore.addToQueue`/`playNext`/`init` — two queue actions in
quick succession (or one racing a `remove`/`clear`/`consumeHead`)
could resurrect an item the user just removed, or silently drop one
just added. Fixed with a single shared sequence counter bumped by
every mutating method; the methods that re-fetch via `list()` only
apply that fetch if no newer mutation started while it was in flight. 8. `playlistsStore.refresh` (and therefore `create`/`rename`/
`setDescription`, which all call it) — renaming one playlist while
deleting another could resurrect the deleted one. Same fix shape. 9. `LibraryContext`'s `refresh`/mount-time fetch — clicking "Remove" on
two scan-root folders in quick succession (nothing disables the
buttons) could leave the Library view showing tracks from a folder
just removed. Fixed with a `useRef`-held sequence shared between the
mount effect and `refresh`, since the hazard exists between them too
(an early `addFolder` racing the still-in-flight initial load).

**Other real bugs, frontend:** 10. **Two dialogs open at once both reacted to one Escape press.** Every
open `Dialog` registered its own independent `document`-level
keydown listener with no awareness of any other one.
`MetadataEditDialog` and `ConfirmDialog` can both be open
simultaneously (clicking "Save" opens a confirmation on top of the
still-open editor); pressing Escape to dismiss just the confirmation
also closed the editor underneath, discarding unsaved edits. Fixed
with a module-level stack of open dialog ids — each instance only
acts on Escape/Tab-trapping when it's the topmost one. 11. **The playback-progress slider divided by zero before any track had
ever loaded a duration.** `Slider`'s fill-percent calculation is
`(value - min) / (max - min)`; both `MiniPlayer`/`FullPlayer` pass
`max={durationMs ?? 0}` with `min=0`, so before anything has ever
played this is `0/0 = NaN` — an invalid CSS `<percentage>` that
silently broke the `var()` substitution in the track's fill
gradient. Fixed by special-casing a zero range to 0%. 12. **Toasts rendered on top of the persistent mini-player's controls.**
`.op-toast-viewport`'s `bottom: var(--space-lg)` (24px) sat well
inside the mini-player's 72px band, so every toast (a frequently-
triggered, real action confirmation) covered its favorite-heart/
volume-slider corner for the few seconds it was visible. Fixed by
offsetting from a new shared `--mini-player-height` token instead of
a bare spacing value, so the two can't drift apart again. 13. **`MediaRow` was a `<button>` containing two more independently-
focusable `role="button"` elements of its own** (the favorite
toggle, the "..." menu trigger) — interactive content nested inside
a native `<button>` is invalid HTML, and WebKitGTK (this app's
actual runtime) commonly exposes a `<button>` to the accessibility
tree as a leaf node, risking the inner controls not being reachable
or announced correctly by assistive technology despite having their
own `aria-label`s. This is the single shared row primitive used by
every list in the app. Fixed by changing the root to a `role=
    "button"` div with Enter/Space activation wired up manually to
replace what a real button gave for free — verified equivalent
keyboard behavior with new tests, though the actual HTML-validity
defect isn't something jsdom enforces, so those tests confirm the
fix's behavior rather than failing against the pre-fix version. 14. **The Queue view's "Now playing" row was a dead control.** Rendered
via `MediaRow` (a real, focusable, hover-highlighted button) with no
`onClick` — reachable by keyboard/screen-reader users who'd
naturally expect it to do something, and did nothing. Fixed by
wiring it up like every other row in the app: favorite toggle,
duration, a context menu, and a click that expands to the full
player (the same action `MiniPlayer`'s identity area already
performs for the identical "this is what's playing" row). 15. **A stale ESLint ignore pattern** (unrelated to the sweep's brief,
noticed in passing): not a functional bug, see Phase 13's own
section — already fixed there.

**Backend correctness bugs, `audio-engine`/`src-tauri`:** 16. **A fatal pipeline error on the active slot left the player
permanently reporting "still playing."** `BackendEvent::Error`
(decode failure, the output device disappearing mid-playback) was
forwarded as a `PlayerEvent::Error` and nothing else — contrast with
`Eos`, which fully updates `current`/`is_playing` and emits
`StateChanged`/`PlaybackFinished`. `current_track`/`is_playing`
stayed exactly as they were forever after a real hardware error,
with MPRIS and the frontend both stuck showing "Playing" with no
Rust-side recovery. Fixed to match the "no next queued" EOS branch:
report the error, then report playback as genuinely stopped. 17. **Desktop track-change notifications were entirely gated on MPRIS
having registered successfully**, even though
`org.freedesktop.Notifications` is a fully independent D-Bus
service. If MPRIS failed to register at startup (no session bus,
name already taken — real, possible causes already documented in
`state.rs`), a user with "notify on track change" enabled got zero
notifications for the rest of the session, with nothing logged
anywhere to explain why. Fixed by decoupling track-change detection
(`NowPlayingTracker::refresh_if_changed`) and the notify decision
from `state.mpris.is_some()` — only the MPRIS snapshot itself stays
conditional on MPRIS actually being available.

**Deliberately deferred, not silently dropped:**

- **Playback speed silently resets to 1.0x on every track transition**
  (`GstreamerBackend::set_playback_speed` no-ops below `Paused` state,
  but `apply_slot_settings` always calls it immediately after `load()`,
  pipeline still `Null`). Real, but `player.setPlaybackSpeed` is not
  currently called from any frontend UI — Phase 4 built the backend
  capability but no Settings control was ever wired to it, so this bug
  is unreachable by any actual user action today. Worth fixing whenever
  a playback-speed control is added, not before.
- **Two audio output devices sharing the same display name resolve to
  the same device id** (`list_output_devices` uses `display_name()` as
  both id and name), so selecting the second one always routes to
  whichever the enumeration returns first. A real gap, but this
  development machine (and most single-output setups) can't exercise
  it, and a synthetic reproduction wouldn't verify anything the fix
  itself doesn't already make obvious; deferred until it can be
  verified against real duplicate-named hardware.
- **A structural race between GStreamer's `about-to-finish` signal
  (fired from its own streaming thread) and a `player_set_next` call
  arriving at the moment gapless-next has already been committed.**
  Moderate confidence, not empirically reproduced under real GStreamer
  timing — the reporting agent flagged this as requiring real pipeline
  timing to confirm, not something a `SimulatedBackend` test can
  establish either way. Deferred rather than shipping a speculative fix
  for a race that hasn't been demonstrated to actually occur.
- **An accidental scan of the developer's own real `~/Music` folder**,
  added by automated on-device keyboard testing during this same
  session (a focus-stealing interaction from an unrelated desktop
  notification caused a blind keypress sequence to land on "Add
  Folder"). Not a code bug — flagged to the user to remove via Settings
  > Library at their convenience (or on request), rather than an
  > automated destructive DB write during this pass.

## Phase 14: testing & build quality gate (§36/§38)

Two parts, landed as separate commits: filling in frontend test-suite
gaps, then the full §38 checklist — production build through on-device
verification. A user-requested full-codebase bug-hunt pass (its own
section above) ran in between and took priority once it surfaced real
bugs, which is why this phase's own commits bracket it rather than
landing back-to-back.

**Test-suite gaps**: audited existing coverage before writing anything
— the Rust side already had extensive coverage from every prior phase's
own TDD discipline (79+ tests in `player-core` alone at the time), so
this focused on what the audit actually found missing: the four
Settings views added in Phase 12 (Playback, Library, Audio, Keyboard)
had zero test coverage beyond their underlying store, relying entirely
on manual on-device verification; Library's search only had a
race-condition regression test, never a basic happy-path one. Added six
new test files plus two new Library tests, all real behavioral coverage
(persistence round-trips, backend wiring, conflict detection) rather
than padding.

**§38 checklist — verified with real evidence, methodology noted
per item rather than asserted wholesale**:

- **Production build**: `npx tauri build --no-bundle`. Re-learned a
  gotcha from Phase 13 the hard way a second time this session: a plain
  `cargo build --release` does _not_ embed the frontend
  (`frontendDist`) — that only happens via the `custom-protocol`
  feature the Tauri CLI enables — so an early attempt at this loaded
  `http://localhost:1420` and failed with "Connection refused" once the
  dev server wasn't running.
- **Test the production build**: launched the real release binary (not
  dev) via its now-real desktop entry (`gtk-launch amp` — the same path
  a user double-clicking it in an app launcher takes), confirmed with
  `hyprctl activewindow`/`clients` that it actually received focus and
  rendered, not just started.
- **Scanning / large libraries**: not re-triggered fresh this pass —
  the running production instance already had 14 real tracks scanned
  in across two real roots (confirmed via direct DB inspection), and
  Phase 13's 50k-file fixture re-run (5.45s, release mode) already
  covers the scale question. Re-deriving both from scratch here would
  have re-proven what's already proven.
- **Playback / MPRIS**: searched the command palette for a real scanned
  track ("MOTTO") and played it for real. Confirmed via `busctl` (an
  independent D-Bus client, not app-internal state) that
  `PlaybackStatus`/`Metadata`/`Position` all tracked the real pipeline
  correctly, and confirmed the Phase-13-fixed track-change desktop
  notification fired with the correct title.
- **Missing/corrupt files**: not re-exercised interactively this pass —
  `scan_skips_corrupt_file_but_keeps_going`,
  `scan_detects_deleted_file`, and
  `scan_detects_deleted_file_and_removes_its_cached_artwork` (the
  bug-hunt pass's own new coverage) already exercise this directly and
  precisely; a fresh interactive repro would test the exact same code
  path with strictly less precision.
- **App restart / persistence**: killed the running production
  instance and relaunched it via the desktop entry — library (14
  tracks), both scan roots, and both favorited tracks' heart icons all
  came back exactly as they were beforehand.
- **Media keys**: still true from Phase 11 — Omarchy's own Hyprland
  binds route `XF86Audio*` through Quickshell's built-in MPRIS client,
  and this pass's own fresh MPRIS verification (above) confirms the
  service is still registering and responding correctly, which is the
  entire mechanism media keys depend on.
- **Device switching**: unchanged known limitation — this development
  machine has exactly one real audio output device, so "switching
  between two real devices doesn't interrupt playback" still can't be
  exercised live here; deferred to whenever a second device is on hand,
  same as every prior phase that hit this.

On-device testing methodology note, worth recording since it shaped how
this pass was done: earlier in this same session, blind `wtype`
keyboard automation collided badly with the developer actively using
the machine (Discord notifications stealing window focus mid-sequence)
— see the `feedback-interactive-testing` memory for the full incident.
This pass deliberately checked `hyprctl activewindow` immediately
before every automated interaction rather than assuming focus, and
used single, purposeful actions (one search, one Enter) instead of long
blind sequences, precisely to avoid repeating that.

## Post-Phase-14 user-requested fixes

A cluster of small, independent fixes the user asked for directly while
reviewing the bug-hunt pass and Phase 14's on-device testing, landed as
separate commits since each is its own logical change:

**Custom title bar.** The user wanted the native OS window chrome
replaced with a custom one carrying only a close button, not the usual
minimize/maximize/close trio. `decorations: false` in `tauri.conf.json`
plus a new `TitleBar` component; `data-tauri-drag-region` (a plain HTML
attribute the webview shell recognizes directly, no JS needed) makes
the bar itself draggable exactly like a native title bar. Needed two
new capability permissions the default set didn't require before
removing native decorations: `core:window:allow-close` and
`core:window:allow-start-dragging`.

**Collapsed sidebar spacing, round two.** The bug-hunt pass's own
centering fix (see that section above) was mathematically correct but
the user reported it still looked cramped in practice. The real issue
wasn't alignment — a full-width (`width: 100%`) collapsed nav item
means its own hover/active background fills almost the entire rail
edge-to-edge regardless of how well-centered the icon inside it is.
Widened the collapsed rail 64px → 72px and made each collapsed item a
compact, `margin: auto`-centered 44px button instead of a full-width
one, so the highlight box itself — not just the icon — now has real,
visible margin from both edges.

**Theme not applying on startup.** `main.tsx` calls
`applyTheme("system")` synchronously before React even mounts, purely
to avoid a flash of default browser styling before the real saved
setting can be read asynchronously over IPC — but nothing ever
corrected that placeholder to the user's actual choice except
`Settings.tsx`'s own mount effect. Any non-default theme (e.g. AMOLED
Dark) only ever took effect once the user happened to navigate into
Settings; the rest of the app launched with the wrong theme every time
until then. Centralized theme-changing into `lib/theme.ts`:
`initializeTheme()` (called once from `App.tsx`'s init effect,
alongside every other startup-restoration call) restores the real
saved mode immediately, and `changeTheme()` is what Settings' dropdown
now calls instead of duplicating the apply-and-persist logic itself.
This also fixed a related dormant bug found while touching the same
code: `watchSystemTheme` (the "keep resolved theme synced with a live
OS preference change while 'Match system' is selected" watcher) was
fully implemented since Phase 1 but never actually invoked from
anywhere, so switching OS theme mid-session never updated the app even
with "Match system" selected. Both paths now go through one
`setActiveTheme` that tears down and re-establishes the watcher on
every call, so switching away from "system" can never leave a stale
watcher from a previous mode still reacting to OS changes it shouldn't.
Surfaced a real, unrelated test-infra gap while adding coverage: jsdom
doesn't implement `window.matchMedia` at all, so any component
touching theme resolution previously crashed in tests with no stub —
added a no-op default to the shared Vitest setup file.

**Installed as a real desktop app.** The user didn't want to run this
from a terminal. Built a real production release binary and added a
standard XDG desktop entry (`~/.local/share/applications/amp.desktop`,
icon copied into the `hicolor` theme tree, `update-desktop-database`/
`gtk-update-icon-cache` refreshed) pointing at the built binary —
verified end-to-end by launching through `gtk-launch amp` (the same
resolution path a real app-launcher menu entry takes, not a manual
binary invocation) and confirming the window actually renders and
receives focus. This is a local dev-machine install, not
packaging — Phase 17 (Release Readiness) still owns producing a real
distributable package.

## Phase 15: UI/UX polish pass + second performance pass

A holistic second look (the first was Phase 1), invoking
`omarchy-app-modern-design` per the plan. Rather than a full redesign
pass, this specifically audited for concrete, fixable inconsistencies
across the now-complete app — spacing/hierarchy, icon-size consistency,
hover/focus states, motion, empty-area issues — since the underlying
design system (tokens, three themes, computed WCAG contrast ratios) was
already established carefully in Phase 1 and hasn't drifted: grepping
found essentially zero hardcoded colors or transition durations
bypassing the token system anywhere in the codebase.

**Found and fixed two real, concrete issues:**

1. **`Icon`'s own default size (18px) didn't match what the app
   actually standardizes on.** Every single call site across the whole
   app explicitly passes `size`, and the overwhelming majority pass
   `16` — 18 was never actually used as a "default," just declared as
   one. A future call site that forgot to pass `size` would silently
   render 2px larger than every icon around it. Changed the default to
   16 to match the app's real, established convention.
2. **No interactive element had a pressed (`:active`) state at all** —
   `Button`, sidebar nav items, `MediaRow` track rows, and `Toggle` all
   defined `:hover`/`:focus-visible` but nothing for the moment of an
   actual click, so clicking gave no tactile "this registered" feedback
   beyond whatever the hover state already showed. Per
   `omarchy-app-modern-design`'s own workflow rule (never hand-roll
   styling values — call `frontend-design` for the concrete treatment),
   handed this off as a design brief; given the narrow, mechanical
   scope (a consistency addition using the app's _existing_ token
   language, not a new design direction), applied the result directly:
   `Button`/`Toggle` get a quiet `transform: scale(0.97)` press-down
   (theme-agnostic, no per-variant color decision needed), and
   `Sidebar`/`MediaRow` rows shift their background from `--surface`
   (hover) to `--bg-dimmer` (active) — reusing the same "hover lifts,
   press recedes" relationship those two tokens already express
   elsewhere in the app, not a new color. Both additions ride the
   existing `--motion-fast`/`--motion-base` tokens, which are already
   zeroed under `prefers-reduced-motion: reduce` globally — the pressed
   _state_ still applies for feedback, just without an animated
   transition into it, with no extra media-query handling needed.

**Second performance pass**: re-ran Phase 13's 50k-track scan fixture
in release mode to confirm nothing regressed since — **5.45s**,
matching Phase 13's own 5.45s almost exactly. No Rust changes landed
between Phase 13 and here beyond the bug-hunt pass's correctness fixes
(none perf-sensitive), so this was a confirmation, not a new
measurement under different conditions.

## Phase 0 status

Scaffolding complete: workspace builds, typechecks, lints, formats, and
tests green across both the Rust workspace and the frontend. See
`PLAN.md` for phase-by-phase progress.
