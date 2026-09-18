import { images, settings } from "./ipc";

export type ResolvedTheme = "omarchy-dark" | "omarchy-light" | "amoled-dark";
export type ThemeMode = "system" | ResolvedTheme | "custom";

export const THEME_SETTING_KEY = "appearance.theme_mode";

/** A custom theme picks its own accent color and a background gradient,
 * but deliberately reuses one of the built-in dark/light token sets for
 * everything else (foreground, surfaces, borders) rather than letting
 * the user pick those too — `--bg-dim`/`--bg-dimmer`/`--surface` are
 * each used as small, *solid* panel backgrounds all over the app
 * (sidebar, title bar, menus, rows); a gradient assigned to those would
 * render as dozens of tiny, independent, ugly mini-gradients rather
 * than one cohesive backdrop, and `Artwork.css` assigns `--bg-dim` via
 * the `background-color` property specifically, which can't hold a
 * gradient at all (the value would just be silently dropped). Keeping
 * fg/surface/border on a proven base theme also means a user's own
 * color choices can never make the whole app unreadable — only the
 * backdrop and the accent are customizable. */
export interface CustomThemeConfig {
  base: "omarchy-dark" | "omarchy-light";
  gradientFrom: string;
  gradientTo: string;
  /** Degrees, as in CSS `linear-gradient(<angle>deg, ...)`. */
  angle: number;
  accent: string;
}

export const CUSTOM_THEME_SETTING_KEY = "appearance.custom_theme";
export const BACKGROUND_IMAGE_SETTING_KEY = "appearance.background_image_path";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function resolveSystemTheme(): ResolvedTheme {
  return window.matchMedia(MEDIA_QUERY).matches ? "omarchy-dark" : "omarchy-light";
}

/** Applies the resolved theme to the document root as `data-theme`, which
 * `theme.css` keys its color token sets off of. AMOLED Dark is always an
 * explicit user choice — "system" never resolves to it. Only ever called
 * with a *built-in* mode — "custom" is handled separately by
 * `applyCustomTheme`, since it needs a config `applyTheme` doesn't have. */
export function applyTheme(mode: "system" | ResolvedTheme): void {
  const resolved = mode === "system" ? resolveSystemTheme() : mode;
  document.documentElement.dataset.theme = resolved;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const value = parseInt(clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG relative luminance (sRGB, 0-255 channels) — used to pick a
 * readable label color for an arbitrary user-chosen accent, the same
 * standard every built-in theme's own contrast ratios are checked
 * against (see theme.css's doc comment). */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channels = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function readableTextColorFor(hex: string): string {
  return relativeLuminance(hexToRgb(hex)) > 0.4 ? "#121212" : "#ffffff";
}

function brighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return toHex([r + amount, g + amount, b + amount]);
}

// Both a custom theme's gradient and a custom background image want to
// control `body`'s background, and a user can set either independently
// of the other — this is the one place that reconciles them rather than
// each feature fighting to `style.background =` its own value.
// Priority: an explicit background image always wins over a gradient
// theme (layering a photo under an unrelated color gradient makes no
// sense); with neither set, `body` falls back to its stylesheet rule
// (`background: var(--bg)`, global.css) by clearing the inline style
// entirely rather than setting it to that same value redundantly.
let currentGradient: string | null = null;
let currentBackgroundImage: string | null = null;

function applyBodyBackground(): void {
  if (currentBackgroundImage) {
    // A dark scrim under the image keeps body-level content readable
    // regardless of the image's own brightness/colors — this app has no
    // way to WCAG-check an arbitrary user photo the way every built-in
    // theme's own tokens are checked, so a fixed, generous scrim is the
    // guardrail instead.
    document.body.style.background = `linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)), center / cover no-repeat url("${currentBackgroundImage}")`;
  } else if (currentGradient) {
    document.body.style.background = currentGradient;
  } else {
    document.body.style.background = "";
  }
}

/** Applies a custom theme: the picked dark/light base for everything
 * except backdrop and accent (see `CustomThemeConfig`'s doc comment),
 * the accent as a plain inline-styled override (the same mechanism this
 * module always intended for this — see git history's now-removed
 * `applyAccentColor`, which this supersedes with the full set of
 * accent-derived tokens it never got around to setting), and the
 * gradient as `body`'s background via `applyBodyBackground`. */
function applyCustomTheme(config: CustomThemeConfig): void {
  document.documentElement.dataset.theme = config.base;
  const root = document.documentElement.style;
  root.setProperty("--accent", config.accent);
  root.setProperty("--accent-strong", brighten(config.accent, 24));
  root.setProperty("--on-accent", readableTextColorFor(config.accent));
  currentGradient = `linear-gradient(${config.angle}deg, ${config.gradientFrom}, ${config.gradientTo})`;
  applyBodyBackground();
}

function clearCustomThemeOverrides(): void {
  const root = document.documentElement.style;
  root.removeProperty("--accent");
  root.removeProperty("--accent-strong");
  root.removeProperty("--on-accent");
  currentGradient = null;
  applyBodyBackground();
}

let stopWatchingSystem: (() => void) | null = null;

/** Applies `mode` (with `customConfig` required when `mode` is
 * "custom" — silently treated as "system" without one, e.g. corrupted
 * settings, rather than applying an accent/gradient-less "custom" with
 * nothing to actually customize it), and if it's "system", keeps the
 * resolved theme synced with the OS preference for as long as `mode`
 * stays "system". Tears down and re-establishes the watcher on every
 * call (rather than only setting one up once) so switching away from
 * "system" — or back to it — can never leave a stale watcher from a
 * previous mode still reacting to OS changes it shouldn't anymore. This
 * is the single path both startup restoration and a user's own Settings
 * change go through. */
function setActiveTheme(mode: ThemeMode, customConfig?: CustomThemeConfig): void {
  stopWatchingSystem?.();
  stopWatchingSystem = null;
  if (mode === "custom" && customConfig) {
    applyCustomTheme(customConfig);
    return;
  }
  clearCustomThemeOverrides();
  const builtInMode = mode === "custom" ? "system" : mode;
  applyTheme(builtInMode);
  if (builtInMode === "system") {
    const mql = window.matchMedia(MEDIA_QUERY);
    const handler = () => applyTheme(builtInMode);
    mql.addEventListener("change", handler);
    stopWatchingSystem = () => mql.removeEventListener("change", handler);
  }
}

// `initializeTheme` awaits an IPC round-trip before applying anything;
// if the user opens Settings and picks a theme (`changeTheme`, always
// synchronous) before that read resolves, the read's stale value would
// otherwise land last and silently revert the user's own just-made
// choice — same shape of race this codebase has fixed repeatedly
// elsewhere (a monotonic counter, bumped by whichever call is the
// "latest intent," checked before an in-flight call is allowed to
// apply its result).
let themeSeq = 0;

/** Restores the saved theme at app startup — called once from App.tsx's
 * init effect. Before this, the app rendered with main.tsx's synchronous
 * `applyTheme("system")` (there only to avoid a flash of default browser
 * styling before the real setting can be read asynchronously over IPC)
 * until the user happened to visit Settings, whose own mount effect was
 * previously the only place that ever read and applied the real saved
 * value — so any other theme choice never actually took effect until
 * that visit. */
export async function initializeTheme(): Promise<void> {
  const seq = ++themeSeq;
  let mode: ThemeMode = "system";
  let customConfig: CustomThemeConfig | undefined;
  try {
    const saved = await settings.get<ThemeMode>(THEME_SETTING_KEY);
    if (saved) mode = saved;
    if (mode === "custom") {
      customConfig =
        (await settings.get<CustomThemeConfig>(CUSTOM_THEME_SETTING_KEY)) ?? undefined;
    }
  } catch {
    // Best-effort, same as every other persisted-setting restoration in
    // this app — fall back to the in-memory default.
  }
  if (seq !== themeSeq) return;
  setActiveTheme(mode, customConfig);

  // Independent of theme mode — a background image can sit under any
  // theme, built-in or custom — so restored separately and not allowed
  // to block the theme itself from applying above.
  try {
    const imagePath = await settings.get<string>(BACKGROUND_IMAGE_SETTING_KEY);
    if (imagePath && seq === themeSeq) {
      const dataUrl = await images.readAsDataUrl(imagePath);
      if (seq === themeSeq) {
        currentBackgroundImage = dataUrl;
        applyBodyBackground();
      }
    }
  } catch {
    // The file may have been moved/deleted since it was set, or be over
    // the size limit now enforced server-side — either way, best-effort:
    // fall back to no background image rather than block startup on it.
  }
}

/** Applies and persists a new theme choice — what Settings' own dropdown
 * calls. Goes through the same `setActiveTheme` startup restoration
 * does, so the system-preference watcher is always for the
 * currently-active mode. `customConfig` is required (and persisted)
 * when `mode` is "custom". */
export function changeTheme(mode: ThemeMode, customConfig?: CustomThemeConfig): void {
  ++themeSeq;
  setActiveTheme(mode, customConfig);
  settings.set(THEME_SETTING_KEY, mode).catch(() => {});
  if (mode === "custom" && customConfig) {
    settings.set(CUSTOM_THEME_SETTING_KEY, customConfig).catch(() => {});
  }
}

/** Sets (or clears, with `null`) the custom background image — reads
 * the file via `images.readAsDataUrl` (a one-shot base64 read, not a
 * persistent asset-protocol grant — see `player_core::images`'s doc
 * comment) and persists just the path, not the image data itself, so a
 * later `initializeTheme()` re-reads the current file content rather
 * than resurrecting a stale copy. Independent of theme mode — combines
 * with whichever theme (built-in or custom) is currently active. */
export async function setBackgroundImage(path: string | null): Promise<void> {
  if (path === null) {
    currentBackgroundImage = null;
    applyBodyBackground();
    settings.set(BACKGROUND_IMAGE_SETTING_KEY, null).catch(() => {});
    return;
  }
  const dataUrl = await images.readAsDataUrl(path);
  currentBackgroundImage = dataUrl;
  applyBodyBackground();
  settings.set(BACKGROUND_IMAGE_SETTING_KEY, path).catch(() => {});
}
