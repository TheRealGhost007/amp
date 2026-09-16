import { useEffect } from "react";
import { useCommandPaletteStore } from "../store/commandPaletteStore";
import { useKeyboardShortcutsStore } from "../store/keyboardShortcutsStore";
import { useNavigationStore } from "../store/navigationStore";
import { usePlaybackStore } from "../store/playbackStore";
import { usePlayerViewStore } from "../store/playerViewStore";
import {
  hasHardModifier,
  isEditableElement,
  normalizeKeyCombo,
  type ShortcutId,
} from "./shortcuts";

const SEEK_STEP_MS = 10_000;
const VOLUME_STEP = 0.1;

const ACTIONS: Record<ShortcutId, () => void> = {
  playPause: () => void usePlaybackStore.getState().togglePlayPause(),
  seekBackward: () => {
    const { positionMs, seek } = usePlaybackStore.getState();
    void seek(Math.max(0, positionMs - SEEK_STEP_MS));
  },
  seekForward: () => {
    const { positionMs, durationMs, seek } = usePlaybackStore.getState();
    const max = durationMs ?? positionMs;
    void seek(Math.min(max, positionMs + SEEK_STEP_MS));
  },
  volumeUp: () => {
    const { volume, setVolume } = usePlaybackStore.getState();
    void setVolume(Math.min(1, volume + VOLUME_STEP));
  },
  volumeDown: () => {
    const { volume, setVolume } = usePlaybackStore.getState();
    void setVolume(Math.max(0, volume - VOLUME_STEP));
  },
  next: () => void usePlaybackStore.getState().skipToNext(),
  previous: () => void usePlaybackStore.getState().playPrevious(),
  toggleFavorite: () => void usePlaybackStore.getState().toggleFavorite(),
  commandPalette: () => useCommandPaletteStore.getState().toggle(),
  closeOverlay: () => usePlayerViewStore.getState().collapse(),
  navigateLibrary: () => useNavigationStore.getState().navigate("library"),
  navigateQueue: () => useNavigationStore.getState().navigate("queue"),
  navigatePlaylists: () => useNavigationStore.getState().navigate("playlists"),
};

/** Mounted once (`Shell.tsx`): the single `document`-level listener for
 * every rebindable shortcut in spec §14, dispatching by looking up the
 * pressed combo against `keyboardShortcutsStore`'s current bindings
 * rather than hardcoding keys the way `CommandPalette`/`FullPlayer` used
 * to (each had its own local Ctrl+K/Escape listener before this) — that
 * hardcoding is exactly what made those two un-rebindable.
 *
 * Two guards keep this from fighting with everything else that listens
 * for keydown:
 * - `e.defaultPrevented`: a component with its own local handler for
 *   the same key (`Menu`'s Arrow-key item navigation, `CommandPalette`'s
 *   own list navigation) calls `preventDefault()` for the keys it owns.
 *   React's synthetic handlers run before this native `document`
 *   listener (its root container is a descendant of `document`, earlier
 *   in the bubble phase), so by the time this fires, `defaultPrevented`
 *   already reflects whether some more specific UI already claimed the
 *   keystroke — skip if so, rather than also firing a global action.
 * - Bare-letter and Shift+letter combos (how normal typing and capital
 *   letters work) are suppressed whenever a text field is focused;
 *   only Ctrl/Alt/Meta-modified combos fire unconditionally, since
 *   those essentially never produce a printable character.
 */
export function GlobalShortcuts() {
  const bindings = useKeyboardShortcutsStore((s) => s.bindings);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (!hasHardModifier(e) && isEditableElement(document.activeElement)) return;

      const combo = normalizeKeyCombo(e);
      const id = (Object.keys(bindings) as ShortcutId[]).find(
        (key) => bindings[key] === combo,
      );
      if (!id) return;

      e.preventDefault();
      ACTIONS[id]();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [bindings]);

  return null;
}
