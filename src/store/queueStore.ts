import { create } from "zustand";
import { pathToFileUri, player, queue, type QueueTrackItem } from "../lib/ipc";

interface QueueStore {
  items: QueueTrackItem[];
  loading: boolean;

  init: () => Promise<void>;
  addToQueue: (trackId: number) => Promise<void>;
  playNext: (trackId: number) => Promise<void>;
  remove: (queueItemId: number) => Promise<void>;
  reorder: (queueItemIds: number[]) => Promise<void>;
  clear: () => Promise<void>;
  /** Discards whatever was queued and queues `trackIds` in order — used
   * by "play this track and queue the rest of the list" from every
   * track-listing view (Library, Album/Artist detail, Playlist detail,
   * Favorites, Recently Played). */
  replaceWith: (trackIds: number[]) => Promise<void>;
  /** Removes the current head from the persisted queue and re-syncs the
   * backend's look-ahead slot to the new head — called by
   * `playbackStore` when a `TrackAdvanced` event reports the backend
   * consumed it naturally (gapless/crossfade), never by UI code
   * directly. */
  consumeHead: () => Promise<void>;
  /** Re-points the backend's `next` at the current queue head without
   * changing the queue itself — called by `playbackStore` after
   * `playNow`, which clears the backend's `next` as a side effect of
   * jumping straight to a track outside the queue. */
  syncNext: () => Promise<void>;
}

/** Points `audio_engine::Player`'s single look-ahead slot at the current
 * queue head (or clears it if the queue is empty) — the queue table is
 * the real ordered "what's next" list; `next` is just this app's way of
 * telling the backend what to preload for gapless/crossfade. Called
 * after every mutation here, and by `playbackStore` after `playNow`
 * (which clears the backend's `next` as a side effect). */
async function syncNextWithBackend(items: QueueTrackItem[]) {
  const head = items[0];
  try {
    await player.setNext(
      head ? { id: head.track.id, uri: pathToFileUri(head.track.path) } : null,
    );
  } catch {
    // The audio backend can be unavailable (spec §27 — the app still
    // runs without one); the queue mutation itself already succeeded,
    // so there's nothing actionable here. Without this, every queue
    // action (add/remove/reorder/clear/...) would throw an unhandled
    // rejection on a machine where audio never initialized — matches
    // fetchFavoriteStatus's precedent for this same "best-effort,
    // non-critical IPC call" shape.
  }
}

/** Tauri dispatches non-async commands across a thread pool, so two
 * overlapping queue mutations (e.g. "Add to Queue" on two different
 * tracks in quick succession) are not guaranteed to resolve in call
 * order — same shape of race already fixed once in playbackStore. Every
 * mutating method bumps this before doing anything else; the methods
 * that re-fetch the list from the backend (`init`/`addToQueue`/
 * `playNext`) only apply that fetch's result if no newer mutation
 * started while it was in flight, so a slower, now-superseded `list()`
 * reply can never overwrite state a newer action already produced —
 * including a local (non-refetching) update like `remove`/`clear`/
 * `consumeHead`, which is exactly what a stale reply could otherwise
 * silently resurrect. */
let queueSeq = 0;

export const useQueueStore = create<QueueStore>((set, get) => ({
  items: [],
  loading: true,

  init: async () => {
    const seq = ++queueSeq;
    set({ loading: true });
    const items = await queue.list();
    if (seq !== queueSeq) return;
    set({ items, loading: false });
    await syncNextWithBackend(items);
  },

  addToQueue: async (trackId) => {
    const seq = ++queueSeq;
    await queue.add(trackId);
    const items = await queue.list();
    if (seq !== queueSeq) return;
    set({ items });
    await syncNextWithBackend(items);
  },

  playNext: async (trackId) => {
    const seq = ++queueSeq;
    await queue.playNext(trackId);
    const items = await queue.list();
    if (seq !== queueSeq) return;
    set({ items });
    await syncNextWithBackend(items);
  },

  remove: async (queueItemId) => {
    queueSeq++;
    await queue.remove(queueItemId);
    const items = get().items.filter((item) => item.id !== queueItemId);
    set({ items });
    await syncNextWithBackend(items);
  },

  reorder: async (queueItemIds) => {
    queueSeq++;
    const byId = new Map(get().items.map((item) => [item.id, item]));
    const items = queueItemIds
      .map((id) => byId.get(id))
      .filter((item) => item !== undefined);
    // Optimistic: apply the new order immediately so a drag feels
    // instant, then persist it.
    set({ items });
    await queue.reorder(queueItemIds);
    await syncNextWithBackend(items);
  },

  clear: async () => {
    queueSeq++;
    await queue.clear();
    set({ items: [] });
    await syncNextWithBackend([]);
  },

  replaceWith: async (trackIds) => {
    const seq = ++queueSeq;
    await queue.replace(trackIds);
    const items = await queue.list();
    if (seq !== queueSeq) return;
    set({ items });
    await syncNextWithBackend(items);
  },

  consumeHead: async () => {
    queueSeq++;
    const [head, ...rest] = get().items;
    if (!head) return;
    set({ items: rest });
    await queue.remove(head.id);
    await syncNextWithBackend(rest);
  },

  syncNext: async () => {
    await syncNextWithBackend(get().items);
  },
}));
