import { create } from "zustand";
import type { ViewId } from "../shell/views";

interface NavigationStore {
  activeView: ViewId;
  /** Set when viewing one artist's/album's/playlist's tracks from within
   * their list view; `null` shows the list instead. Lifted out of each
   * view's own state because "View Artist"/"View Album" (from any
   * track's context menu) and the command palette's playlist results
   * need to jump straight to one from anywhere, not just from inside
   * that view itself. */
  artistDetailId: number | null;
  albumDetailId: number | null;
  playlistDetailId: number | null;

  navigate: (view: ViewId) => void;
  viewArtist: (artistId: number) => void;
  viewAlbum: (albumId: number) => void;
  viewPlaylist: (playlistId: number) => void;
  backFromArtist: () => void;
  backFromAlbum: () => void;
  backFromPlaylist: () => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  activeView: "home",
  artistDetailId: null,
  albumDetailId: null,
  playlistDetailId: null,

  navigate: (view) =>
    set({
      activeView: view,
      artistDetailId: null,
      albumDetailId: null,
      playlistDetailId: null,
    }),
  viewArtist: (artistId) => set({ activeView: "artists", artistDetailId: artistId }),
  viewAlbum: (albumId) => set({ activeView: "albums", albumDetailId: albumId }),
  viewPlaylist: (playlistId) =>
    set({ activeView: "playlists", playlistDetailId: playlistId }),
  backFromArtist: () => set({ artistDetailId: null }),
  backFromAlbum: () => set({ albumDetailId: null }),
  backFromPlaylist: () => set({ playlistDetailId: null }),
}));
