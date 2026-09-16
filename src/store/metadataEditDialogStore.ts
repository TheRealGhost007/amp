import { create } from "zustand";

interface MetadataEditDialogStore {
  trackId: number | null;
  /** Runs after a successful save so the view that opened this dialog
   * can refresh its own track data — same reasoning as
   * `TrackMenuOptions.onRemovedFromLibrary` (see `trackMenu.ts`): this
   * dialog is mounted once globally and has no view of its own to
   * refresh. */
  onSaved: (() => void) | null;
  open: (trackId: number, onSaved?: () => void) => void;
  close: () => void;
}

/** One global "edit this track's metadata" dialog, mounted once
 * (`Shell.tsx`) and opened from any track's context menu — same pattern
 * as `addToPlaylistDialogStore`/`confirmDialogStore`. */
export const useMetadataEditDialogStore = create<MetadataEditDialogStore>((set) => ({
  trackId: null,
  onSaved: null,
  open: (trackId, onSaved) => set({ trackId, onSaved: onSaved ?? null }),
  close: () => set({ trackId: null, onSaved: null }),
}));
