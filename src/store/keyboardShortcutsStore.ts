import { create } from "zustand";
import { settings } from "../lib/ipc";
import { DEFAULT_BINDINGS, type ShortcutId } from "../keyboard/shortcuts";

const SETTINGS_KEY = "keyboard.bindings";

interface KeyboardShortcutsStore {
  bindings: Record<ShortcutId, string>;
  loaded: boolean;
  init: () => Promise<void>;
  /** Returns `false` (and leaves bindings untouched) if `combo` is
   * already bound to a different shortcut — the caller (the Settings
   * UI) is responsible for surfacing that as user feedback; silently
   * letting two shortcuts share one combo would make the losing one
   * unreachable with no indication why. */
  rebind: (id: ShortcutId, combo: string) => boolean;
  resetToDefault: (id: ShortcutId) => void;
  resetAllToDefaults: () => void;
}

function persist(bindings: Record<ShortcutId, string>) {
  settings.set(SETTINGS_KEY, bindings).catch(() => {
    // Best-effort, matching every other setting in this app — a failed
    // write just means the rebind doesn't survive a restart.
  });
}

export const useKeyboardShortcutsStore = create<KeyboardShortcutsStore>((set, get) => ({
  bindings: { ...DEFAULT_BINDINGS },
  loaded: false,

  init: async () => {
    try {
      const saved = await settings.get<Partial<Record<ShortcutId, string>>>(SETTINGS_KEY);
      if (saved) {
        set({ bindings: { ...DEFAULT_BINDINGS, ...saved }, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  rebind: (id, combo) => {
    const { bindings } = get();
    const conflictingId = (Object.keys(bindings) as ShortcutId[]).find(
      (other) => other !== id && bindings[other] === combo,
    );
    if (conflictingId) return false;

    const next = { ...bindings, [id]: combo };
    set({ bindings: next });
    persist(next);
    return true;
  },

  resetToDefault: (id) => {
    const next = { ...get().bindings, [id]: DEFAULT_BINDINGS[id] };
    set({ bindings: next });
    persist(next);
  },

  resetAllToDefaults: () => {
    const next = { ...DEFAULT_BINDINGS };
    set({ bindings: next });
    persist(next);
  },
}));
