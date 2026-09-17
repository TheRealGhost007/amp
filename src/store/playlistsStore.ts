import { create } from "zustand";
import { playlists, type PlaylistSummary } from "../lib/ipc";

interface PlaylistsStore {
  items: PlaylistSummary[];
  loading: boolean;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  create: (name: string) => Promise<number>;
  rename: (id: number, name: string) => Promise<void>;
  setDescription: (id: number, description: string | null) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

/** Tauri dispatches non-async commands across a thread pool, so two
 * overlapping mutations (e.g. renaming one playlist while deleting
 * another) are not guaranteed to resolve in call order — same shape of
 * race already fixed once in playbackStore. `refresh`'s `list()`
 * round-trip only applies if no newer mutation started while it was in
 * flight, so a slower, now-superseded reply can't resurrect a playlist
 * `remove` already dropped locally. */
let playlistsSeq = 0;

/** Playlist summaries (name/description/track count) for the Playlists
 * list view — a playlist's own tracks are fetched separately, view-local
 * to whichever detail screen is open, since only one is ever shown at a
 * time. */
export const usePlaylistsStore = create<PlaylistsStore>((set, get) => ({
  items: [],
  loading: true,

  init: async () => {
    const seq = ++playlistsSeq;
    set({ loading: true });
    const items = await playlists.list();
    if (seq !== playlistsSeq) return;
    set({ items, loading: false });
  },

  refresh: async () => {
    const seq = ++playlistsSeq;
    const items = await playlists.list();
    if (seq !== playlistsSeq) return;
    set({ items });
  },

  create: async (name) => {
    const created = await playlists.create(name);
    await get().refresh();
    return created.id;
  },

  rename: async (id, name) => {
    await playlists.rename(id, name);
    await get().refresh();
  },

  setDescription: async (id, description) => {
    await playlists.setDescription(id, description);
    await get().refresh();
  },

  remove: async (id) => {
    playlistsSeq++;
    await playlists.delete(id);
    set({ items: get().items.filter((p) => p.id !== id) });
  },
}));
