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

## Phase 0 status

Scaffolding complete: workspace builds, typechecks, lints, formats, and
tests green across both the Rust workspace and the frontend. See
`PLAN.md` for phase-by-phase progress.
