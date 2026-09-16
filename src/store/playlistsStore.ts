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

/** Playlist summaries (name/description/track count) for the Playlists
 * list view — a playlist's own tracks are fetched separately, view-local
 * to whichever detail screen is open, since only one is ever shown at a
 * time. */
export const usePlaylistsStore = create<PlaylistsStore>((set, get) => ({
  items: [],
  loading: true,

  init: async () => {
    set({ loading: true });
    const items = await playlists.list();
    set({ items, loading: false });
  },

  refresh: async () => {
    set({ items: await playlists.list() });
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
    await playlists.delete(id);
    set({ items: get().items.filter((p) => p.id !== id) });
  },
}));
