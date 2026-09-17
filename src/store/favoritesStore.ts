import { create } from "zustand";
import { favorites } from "../lib/ipc";

interface FavoritesStore {
  ids: Set<number>;
  loading: boolean;

  init: () => Promise<void>;
  toggle: (trackId: number) => Promise<void>;
}

/** Tauri dispatches non-async commands across a thread pool, so two
 * concurrent `toggle` calls (e.g. double-clicking a heart icon fast) are
 * not guaranteed to resolve in call order — same shape of race already
 * fixed once in playbackStore (trackMutationSeq/favoriteSeq). Guarding
 * per-track rather than with one global counter, since toggling track A
 * must never be able to invalidate a concurrent, unrelated toggle of
 * track B. */
let toggleSeq = 0;
const toggleSeqByTrack = new Map<number, number>();

/** A shared, general-purpose "is track X favorited" lookup for row
 * rendering (Library/Queue/Playlist/Favorites/Recently Played rows all
 * need this), backed by one batch fetch rather than a per-row IPC call.
 * Distinct from `playbackStore.isFavorite`, which tracks the *currently
 * playing* track specifically and is refetched on every track change —
 * that one stays as-is; this one is for everything else. */
export const useFavoritesStore = create<FavoritesStore>((set, get) => ({
  ids: new Set(),
  loading: true,

  init: async () => {
    set({ loading: true });
    const ids = await favorites.listIds();
    set({ ids: new Set(ids), loading: false });
  },

  toggle: async (trackId) => {
    const seq = ++toggleSeq;
    toggleSeqByTrack.set(trackId, seq);
    const isFavorite = await favorites.toggle(trackId);
    if (toggleSeqByTrack.get(trackId) !== seq) return;
    const ids = new Set(get().ids);
    if (isFavorite) ids.add(trackId);
    else ids.delete(trackId);
    set({ ids });
  },
}));
