import { settings } from "./ipc";

export type ResolvedTheme = "omarchy-dark" | "omarchy-light" | "amoled-dark";
export type ThemeMode = "system" | ResolvedTheme;

export const THEME_SETTING_KEY = "appearance.theme_mode";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function resolveSystemTheme(): ResolvedTheme {
  return window.matchMedia(MEDIA_QUERY).matches ? "omarchy-dark" : "omarchy-light";
}

/** Applies the resolved theme to the document root as `data-theme`, which
 * `theme.css` keys its color token sets off of. AMOLED Dark is always an
 * explicit user choice — "system" never resolves to it. */
export function applyTheme(mode: ThemeMode): void {
  const resolved = mode === "system" ? resolveSystemTheme() : mode;
  document.documentElement.dataset.theme = resolved;
}

export function applyAccentColor(hex: string): void {
  document.documentElement.style.setProperty("--accent", hex);
}

let stopWatchingSystem: (() => void) | null = null;

/** Applies `mode`, and if it's "system", keeps the resolved theme synced
 * with the OS preference for as long as `mode` stays "system". Tears
 * down and re-establishes the watcher on every call (rather than only
 * setting one up once) so switching away from "system" — or back to it
 * — can never leave a stale watcher from a previous mode still reacting
 * to OS changes it shouldn't anymore. This is the single path both
 * startup restoration and a user's own Settings change go through. */
function setActiveTheme(mode: ThemeMode): void {
  stopWatchingSystem?.();
  stopWatchingSystem = null;
  applyTheme(mode);
  if (mode === "system") {
    const mql = window.matchMedia(MEDIA_QUERY);
    const handler = () => applyTheme(mode);
    mql.addEventListener("change", handler);
    stopWatchingSystem = () => mql.removeEventListener("change", handler);
  }
}

/** Restores the saved theme at app startup — called once from App.tsx's
 * init effect. Before this, the app rendered with main.tsx's synchronous
 * `applyTheme("system")` (there only to avoid a flash of default browser
 * styling before the real setting can be read asynchronously over IPC)
 * until the user happened to visit Settings, whose own mount effect was
 * previously the only place that ever read and applied the real saved
 * value — so any other theme choice never actually took effect until
 * that visit. */
export async function initializeTheme(): Promise<void> {
  let mode: ThemeMode = "system";
  try {
    const saved = await settings.get<ThemeMode>(THEME_SETTING_KEY);
    if (saved) mode = saved;
  } catch {
    // Best-effort, same as every other persisted-setting restoration in
    // this app — fall back to the in-memory default.
  }
  setActiveTheme(mode);
}

/** Applies and persists a new theme choice — what Settings' own dropdown
 * calls. Goes through the same `setActiveTheme` startup restoration
 * does, so the system-preference watcher is always for the
 * currently-active mode. */
export function changeTheme(mode: ThemeMode): void {
  setActiveTheme(mode);
  settings.set(THEME_SETTING_KEY, mode).catch(() => {});
}
