import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueTrackItem } from "../lib/ipc";

const listMock = vi.fn();
const addMock = vi.fn();
const playNextMock = vi.fn();
const removeMock = vi.fn();
const reorderMock = vi.fn();
const clearMock = vi.fn();
const setNextMock = vi.fn();

vi.mock("../lib/ipc", () => ({
  pathToFileUri: (path: string) => `file://${path}`,
  player: {
    setNext: (...args: unknown[]) => setNextMock(...args),
  },
  queue: {
    list: (...args: unknown[]) => listMock(...args),
    add: (...args: unknown[]) => addMock(...args),
    playNext: (...args: unknown[]) => playNextMock(...args),
    remove: (...args: unknown[]) => removeMock(...args),
    reorder: (...args: unknown[]) => reorderMock(...args),
    clear: (...args: unknown[]) => clearMock(...args),
  },
}));

const { useQueueStore } = await import("./queueStore");

function item(id: number, trackId: number, path: string): QueueTrackItem {
  return {
    id,
    track: {
      id: trackId,
      path,
      title: `Track ${trackId}`,
      artist_id: null,
      artist_name: null,
      album_id: null,
      album_title: null,
      album_artist: null,
      genre_name: null,
      track_number: null,
      disc_number: null,
      duration_ms: 1000,
      year: null,
      has_embedded_art: false,
      added_at: 0,
    },
  };
}

describe("queueStore", () => {
  beforeEach(() => {
    listMock.mockReset();
    addMock.mockReset();
    playNextMock.mockReset();
    removeMock.mockReset();
    reorderMock.mockReset();
    clearMock.mockReset();
    setNextMock.mockReset();
    useQueueStore.setState({ items: [], loading: false });
  });

  it("syncs the backend's next slot to the new head after consumeHead", async () => {
    useQueueStore.setState({
      items: [item(10, 1, "/a.flac"), item(11, 2, "/b.flac")],
    });

    await useQueueStore.getState().consumeHead();

    expect(removeMock).toHaveBeenCalledWith(10);
    expect(useQueueStore.getState().items).toEqual([item(11, 2, "/b.flac")]);
    expect(setNextMock).toHaveBeenCalledWith({ id: 2, uri: "file:///b.flac" });
  });

  it("clears the backend's next slot when consumeHead empties the queue", async () => {
    useQueueStore.setState({ items: [item(10, 1, "/a.flac")] });

    await useQueueStore.getState().consumeHead();

    expect(useQueueStore.getState().items).toEqual([]);
    expect(setNextMock).toHaveBeenCalledWith(null);
  });

  it("reorders by row id, correctly disambiguating a track queued twice", async () => {
    // Regression-shaped test: two rows share the same track_id (1), so
    // reordering must key off each row's own id, not track_id, or the
    // wrong occurrence could end up in the wrong slot.
    const first = item(10, 1, "/a.flac");
    const middle = item(11, 2, "/b.flac");
    const second = item(12, 1, "/a.flac");
    useQueueStore.setState({ items: [first, middle, second] });

    await useQueueStore.getState().reorder([12, 10, 11]);

    expect(reorderMock).toHaveBeenCalledWith([12, 10, 11]);
    expect(useQueueStore.getState().items).toEqual([second, first, middle]);
    expect(setNextMock).toHaveBeenCalledWith({ id: 1, uri: "file:///a.flac" });
  });

  it("does nothing when consumeHead is called on an empty queue", async () => {
    await useQueueStore.getState().consumeHead();
    expect(removeMock).not.toHaveBeenCalled();
    expect(setNextMock).not.toHaveBeenCalled();
  });

  it("syncNext re-points the backend at the current head without mutating the queue", async () => {
    useQueueStore.setState({ items: [item(10, 1, "/a.flac")] });

    await useQueueStore.getState().syncNext();

    expect(setNextMock).toHaveBeenCalledWith({ id: 1, uri: "file:///a.flac" });
    expect(removeMock).not.toHaveBeenCalled();
    expect(useQueueStore.getState().items).toEqual([item(10, 1, "/a.flac")]);
  });

  it("a slower, superseded addToQueue reply does not overwrite a newer action's result", async () => {
    // Regression test: Tauri dispatches non-async commands across a
    // thread pool, so two overlapping mutations are not guaranteed to
    // resolve in call order. Without a sequence guard, this stale
    // addToQueue reply arriving after playNext's already-applied result
    // would silently resurrect a stale snapshot, dropping whatever
    // playNext actually did.
    let resolveFirstList!: (items: QueueTrackItem[]) => void;
    listMock.mockImplementationOnce(
      () => new Promise<QueueTrackItem[]>((resolve) => (resolveFirstList = resolve)),
    );
    addMock.mockResolvedValue(undefined);
    playNextMock.mockResolvedValue(undefined);

    const firstCall = useQueueStore.getState().addToQueue(1);
    listMock.mockResolvedValueOnce([item(20, 2, "/b.flac")]);
    await useQueueStore.getState().playNext(2);
    expect(useQueueStore.getState().items).toEqual([item(20, 2, "/b.flac")]);

    // The slower call's reply finally arrives — must be discarded, not
    // applied over the newer, correct state.
    resolveFirstList([item(10, 1, "/a.flac")]);
    await firstCall;

    expect(useQueueStore.getState().items).toEqual([item(20, 2, "/b.flac")]);
  });

  it("a slower, superseded addToQueue reply cannot resurrect an item a newer remove() already dropped", async () => {
    useQueueStore.setState({ items: [item(10, 1, "/a.flac"), item(11, 2, "/b.flac")] });
    let resolveList!: (items: QueueTrackItem[]) => void;
    listMock.mockImplementationOnce(
      () => new Promise<QueueTrackItem[]>((resolve) => (resolveList = resolve)),
    );
    addMock.mockResolvedValue(undefined);
    removeMock.mockResolvedValue(undefined);

    const addCall = useQueueStore.getState().addToQueue(3);
    await useQueueStore.getState().remove(11);
    expect(useQueueStore.getState().items).toEqual([item(10, 1, "/a.flac")]);

    // addToQueue's stale list() reply (fetched before the remove landed
    // server-side) still includes the removed item — must not resurrect it.
    resolveList([item(10, 1, "/a.flac"), item(11, 2, "/b.flac"), item(12, 3, "/c.flac")]);
    await addCall;

    expect(useQueueStore.getState().items).toEqual([item(10, 1, "/a.flac")]);
  });

  it("does not throw when the backend's next slot can't be armed (e.g. audio unavailable)", async () => {
    // Regression test: every mutation calls syncNextWithBackend, which
    // previously let player.setNext's rejection propagate unguarded —
    // on a machine where the audio backend never initialized, every
    // single queue action would throw an unhandled rejection even
    // though the queue mutation itself (a DB write) had already
    // succeeded. fetchFavoriteStatus already established the precedent
    // of swallowing this class of best-effort IPC failure.
    setNextMock.mockRejectedValue({ code: "AUDIO_UNAVAILABLE" });
    listMock.mockResolvedValue([item(10, 1, "/a.flac")]);

    await expect(useQueueStore.getState().addToQueue(1)).resolves.toBeUndefined();
    expect(useQueueStore.getState().items).toEqual([item(10, 1, "/a.flac")]);
  });
});
