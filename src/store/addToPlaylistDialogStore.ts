import { create } from "zustand";

interface AddToPlaylistDialogStore {
  trackId: number | null;
  open: (trackId: number) => void;
  close: () => void;
}

/** One global "add this track to a playlist" dialog, mounted once
 * (`Shell.tsx`) and opened from anywhere a track context menu appears
 * (Library, Queue, playlists, Favorites, Recently Played) — avoids every
 * one of those views needing its own local dialog-open state and its
 * own mounted `<AddToPlaylistDialog>`. */
export const useAddToPlaylistDialogStore = create<AddToPlaylistDialogStore>((set) => ({
  trackId: null,
  open: (trackId) => set({ trackId }),
  close: () => set({ trackId: null }),
}));
