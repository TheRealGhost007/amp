# Amp

A premium, native music player for Omarchy Linux (repo/crate name
`omarchy-player`; the product itself is called **Amp** — see
`ARCHITECTURE.md`'s Phase 1 section for the naming rationale).

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

## Packaging

```
npm run tauri build
```

Produces `target/release/bundle/appimage/Amp_<version>_amd64.AppImage`
(the only bundle target configured — see `src-tauri/tauri.conf.json`;
`deb`/`rpm` don't apply on an Arch-based system). `bundleMediaFramework`
is set so the AppImage carries its own GStreamer plugins rather than
depending on the host's — without it, the bundle links only the core
`libgstreamer-1.0.so` (a direct link dependency) and silently omits every
plugin `.so` GStreamer discovers via `dlopen` at runtime, `playbin3`
included, so packaged playback fails outright with none of Tauri's own
tooling flagging it as an error.

Two host-toolchain issues came up bundling on this machine (an Arch/
Omarchy system with a rolling-release, ahead-of-upstream toolchain) —
neither is Amp-specific, but worth knowing before assuming a failed
bundle means a real regression:

- **`linuxdeploy` needs `patchelf`**, which isn't installed here and
  needs root to add via `pacman`. `pip install --user patchelf` pulls
  its prebuilt-binary PyPI wheel with no root needed.
- **`linuxdeploy`'s bundled `strip` predates the RELR relocation format**
  (`.relr.dyn`) Arch's current libraries are built with, and fails on
  every one of them. Build with `NO_STRIP=1` (a `linuxdeploy` env var)
  to skip stripping the bundled libraries — a slightly larger AppImage,
  not a functional loss.
- **`linuxdeploy-plugin-gtk` expects gdk-pixbuf's old external loader
  `.so` files** under `<libdir>/gdk-pixbuf-2.0/<version>/loaders`; recent
  Arch (`gdk-pixbuf2` 2.44+) has moved to `glycin`, a sandboxed
  out-of-process loader with no such directory at all, so the plugin's
  `cp` on that path fails outright. Point `PKG_CONFIG_PATH` at a
  `gdk-pixbuf-2.0.pc` override redefining `gdk_pixbuf_binarydir` to any
  writable, existing (even empty) directory — the plugin only wants
  something to copy, and this app doesn't render through GTK image
  widgets that would need real bundled loaders.

Smoke-tested by actually launching the built AppImage and confirming (1)
the window renders correctly under Hyprland and (2) `playbin3` resolves
from the bundle's own plugin set — `gst-inspect-1.0 playbin3` against the
AppImage's `GST_PLUGIN_SYSTEM_PATH_1_0`, not just an absence of a logged
error, per this project's own "verify, don't assume" standard.
