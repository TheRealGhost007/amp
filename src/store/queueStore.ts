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
  await player.setNext(
    head ? { id: head.track.id, uri: pathToFileUri(head.track.path) } : null,
  );
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  items: [],
  loading: true,

  init: async () => {
    set({ loading: true });
    const items = await queue.list();
    set({ items, loading: false });
    await syncNextWithBackend(items);
  },

  addToQueue: async (trackId) => {
    await queue.add(trackId);
    const items = await queue.list();
    set({ items });
    await syncNextWithBackend(items);
  },

  playNext: async (trackId) => {
    await queue.playNext(trackId);
    const items = await queue.list();
    set({ items });
    await syncNextWithBackend(items);
  },

  remove: async (queueItemId) => {
    await queue.remove(queueItemId);
    const items = get().items.filter((item) => item.id !== queueItemId);
    set({ items });
    await syncNextWithBackend(items);
  },

  reorder: async (queueItemIds) => {
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
    await queue.clear();
    set({ items: [] });
    await syncNextWithBackend([]);
  },

  consumeHead: async () => {
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
