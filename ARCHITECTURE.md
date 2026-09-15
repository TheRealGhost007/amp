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

| Pair | Theme | Ratio | Passes |
|---|---|---|---|
| foreground / background | Omarchy Dark | 10.1:1 | Yes |
| accent / background | Omarchy Dark | 7.4:1 | Yes |
| danger / background | Omarchy Dark | 5.0:1 | Yes |
| foreground / background | Omarchy Light | 15.7:1 | Yes |
| accent / background | Omarchy Light | 5.0:1 | Yes (darkened from the dark theme's raw #e68e0d, which only cleared ~4.0:1 here) |
| danger / background | Omarchy Light | 5.6:1 | Yes |
| foreground / background | AMOLED Dark | 11.3:1 | Yes |

**Before/after**: before this phase the app was an unstyled Tauri/React
tutorial scaffold (default logos, default black-on-white text, no theme
system). After: three complete, contrast-checked themes, a 14-component
primitive set (Button, Input, Slider, Card, Artwork, MediaRow, Tabs,
Tooltip, Popover, Menu, Dropdown, Dialog, Toast, Icon), and a named
product identity — verified rendering correctly on-device (see Known
tradeoff note above for the launch bug hit and fixed along the way).

## Phase 0 status

Scaffolding complete: workspace builds, typechecks, lints, formats, and
tests green across both the Rust workspace and the frontend. See
`PLAN.md` for phase-by-phase progress.
