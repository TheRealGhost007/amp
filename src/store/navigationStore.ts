import { create } from "zustand";
import type { ViewId } from "../shell/views";

interface NavigationStore {
  activeView: ViewId;
  /** Set when viewing one artist's tracks from within the Artists view;
   * `null` shows the artist list instead. Lifted out of `Artists.tsx`'s
   * own state (unlike `Playlists.tsx`'s detail selection, which stays
   * view-local) because "View Artist" needs to be triggerable from any
   * track's context menu, not just from inside the Artists view itself. */
  artistDetailId: number | null;
  albumDetailId: number | null;

  navigate: (view: ViewId) => void;
  viewArtist: (artistId: number) => void;
  viewAlbum: (albumId: number) => void;
  backFromArtist: () => void;
  backFromAlbum: () => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  activeView: "home",
  artistDetailId: null,
  albumDetailId: null,

  navigate: (view) =>
    set({ activeView: view, artistDetailId: null, albumDetailId: null }),
  viewArtist: (artistId) => set({ activeView: "artists", artistDetailId: artistId }),
  viewAlbum: (albumId) => set({ activeView: "albums", albumDetailId: albumId }),
  backFromArtist: () => set({ artistDetailId: null }),
  backFromAlbum: () => set({ albumDetailId: null }),
}));
