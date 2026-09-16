import { create } from "zustand";

interface PlayerViewStore {
  /** Whether the full-screen player is showing over the mini-player.
   * Lifted out of `PlayerDock`'s own state (Phase 7) so the global
   * keyboard shortcut manager's Escape binding can collapse it from
   * outside the component tree, the same reason view-switching moved
   * into `navigationStore` in Phase 9. */
  expanded: boolean;
  expand: () => void;
  collapse: () => void;
}

export const usePlayerViewStore = create<PlayerViewStore>((set) => ({
  expanded: false,
  expand: () => set({ expanded: true }),
  collapse: () => set({ expanded: false }),
}));
