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
 * track B.
 *
 * `globalSeq` is separate and shared: `init()`'s own fetch is a *set*
 * replacement, not per-track, so any `toggle()` that lands while an
 * `init()` is still in flight (e.g. favoriting a track right at
 * startup, before the initial `listIds()` reply arrives) must be able
 * to invalidate that `init()`'s now-stale result — otherwise the
 * optimistic toggle applies first and `init()`'s late reply silently
 * wipes it back out. */
let toggleSeq = 0;
const toggleSeqByTrack = new Map<number, number>();
let globalSeq = 0;

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
    const seq = ++globalSeq;
    set({ loading: true });
    const ids = await favorites.listIds();
    if (seq !== globalSeq) {
      // A toggle (or a newer init) landed while this fetch was in
      // flight — its result is already reflected in state and is
      // strictly newer than this reply, so don't overwrite it.
      set({ loading: false });
      return;
    }
    set({ ids: new Set(ids), loading: false });
  },

  toggle: async (trackId) => {
    ++globalSeq;
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
