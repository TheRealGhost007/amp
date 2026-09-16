/** Global keyboard shortcuts (spec §14): Space/arrows/Ctrl+K/L/Q/F/N/P/
 * Shift+P/Escape. Single letters are view-navigation (L=Library,
 * Q=Queue) or per-track actions (F=Favorite, N=Next, P=Previous);
 * Shift+P is Playlists (disambiguated from the bare P=Previous
 * transport key). Escape's rebindable action is specifically "collapse
 * the full-screen player" — the Escape-closes-*this*-dialog/menu/
 * popover behavior already built for every other overlay is a fixed
 * platform convention (WAI-ARIA dialog pattern), not something a user
 * should be able to rebind away from Escape, so those stay on their own
 * local handlers untouched by this registry. */

export type ShortcutId =
  | "playPause"
  | "seekBackward"
  | "seekForward"
  | "volumeUp"
  | "volumeDown"
  | "commandPalette"
  | "navigateLibrary"
  | "navigateQueue"
  | "navigatePlaylists"
  | "toggleFavorite"
  | "next"
  | "previous"
  | "closeOverlay";

export interface ShortcutDef {
  id: ShortcutId;
  label: string;
  category: "Playback" | "Navigation" | "General";
  defaultBinding: string;
}

export const SHORTCUT_DEFS: ShortcutDef[] = [
  {
    id: "playPause",
    label: "Play / Pause",
    category: "Playback",
    defaultBinding: "Space",
  },
  {
    id: "seekBackward",
    label: "Seek backward 10s",
    category: "Playback",
    defaultBinding: "ArrowLeft",
  },
  {
    id: "seekForward",
    label: "Seek forward 10s",
    category: "Playback",
    defaultBinding: "ArrowRight",
  },
  { id: "volumeUp", label: "Volume up", category: "Playback", defaultBinding: "ArrowUp" },
  {
    id: "volumeDown",
    label: "Volume down",
    category: "Playback",
    defaultBinding: "ArrowDown",
  },
  { id: "next", label: "Next track", category: "Playback", defaultBinding: "N" },
  { id: "previous", label: "Previous track", category: "Playback", defaultBinding: "P" },
  {
    id: "toggleFavorite",
    label: "Toggle favorite",
    category: "Playback",
    defaultBinding: "F",
  },
  {
    id: "commandPalette",
    label: "Open command palette",
    category: "General",
    defaultBinding: "Ctrl+K",
  },
  {
    id: "closeOverlay",
    label: "Close full-screen player",
    category: "General",
    defaultBinding: "Escape",
  },
  {
    id: "navigateLibrary",
    label: "Go to Library",
    category: "Navigation",
    defaultBinding: "L",
  },
  {
    id: "navigateQueue",
    label: "Go to Queue",
    category: "Navigation",
    defaultBinding: "Q",
  },
  {
    id: "navigatePlaylists",
    label: "Go to Playlists",
    category: "Navigation",
    defaultBinding: "Shift+P",
  },
];

export const DEFAULT_BINDINGS: Record<ShortcutId, string> = Object.fromEntries(
  SHORTCUT_DEFS.map((def) => [def.id, def.defaultBinding]),
) as Record<ShortcutId, string>;

/** Canonical string form of a key combo — `"Ctrl+Shift+K"`,
 * `"ArrowLeft"`, `"Space"` — used both to store/compare bindings and to
 * turn a live `KeyboardEvent` into the same shape for lookup. Modifier
 * order is fixed (Ctrl, Alt, Shift, Meta) so the same combo always
 * normalizes identically regardless of press order. */
export function normalizeKeyCombo(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">,
): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");

  let key = e.key;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);

  return parts.join("+");
}

/** A combo is a "hard" shortcut — safe to fire even while a text field
 * is focused — only when it carries a modifier that virtually never
 * produces a printable character on its own (Ctrl/Alt/Meta). A bare
 * letter or a Shift+letter combo (how you type a capital letter) must
 * never hijack normal typing. */
export function hasHardModifier(
  e: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "metaKey">,
): boolean {
  return e.ctrlKey || e.altKey || e.metaKey;
}

export function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean((el as HTMLElement).isContentEditable);
}
