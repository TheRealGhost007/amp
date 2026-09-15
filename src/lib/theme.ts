export type ResolvedTheme = "omarchy-dark" | "omarchy-light" | "amoled-dark";
export type ThemeMode = "system" | ResolvedTheme;

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

/** Keeps the resolved theme in sync when `mode === "system"` and the OS
 * preference changes while the app is open. Returns an unsubscribe fn. */
export function watchSystemTheme(mode: ThemeMode, onChange: () => void): () => void {
  if (mode !== "system") return () => {};
  const mql = window.matchMedia(MEDIA_QUERY);
  const handler = () => onChange();
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}
