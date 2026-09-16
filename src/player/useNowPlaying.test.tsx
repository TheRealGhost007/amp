import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueTrackItem, TrackListItem, TrackRef } from "../lib/ipc";
import { useNowPlaying } from "./useNowPlaying";

const mockUseLibrary = vi.fn();
vi.mock("../context/LibraryContext", () => ({
  useLibrary: () => mockUseLibrary(),
}));

const mockSkipToNext = vi.fn();
const mockPlayPrevious = vi.fn();
let mockCurrentTrack: TrackRef | null = null;
let mockHistoryLength = 0;
vi.mock("../store/playbackStore", () => ({
  usePlaybackStore: (selector: (s: unknown) => unknown) =>
    selector({
      currentTrack: mockCurrentTrack,
      history: { length: mockHistoryLength },
      skipToNext: mockSkipToNext,
      playPrevious: mockPlayPrevious,
    }),
}));

let mockQueueItems: QueueTrackItem[] = [];
vi.mock("../store/queueStore", () => ({
  useQueueStore: (selector: (s: unknown) => unknown) =>
    selector({ items: mockQueueItems }),
}));

function track(id: number, path: string): TrackListItem {
  return {
    id,
    path,
    title: `Track ${id}`,
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
  };
}

const tracks = [track(1, "/a.flac"), track(2, "/b.flac"), track(3, "/c.flac")];

describe("useNowPlaying", () => {
  beforeEach(() => {
    mockSkipToNext.mockReset();
    mockPlayPrevious.mockReset();
    mockCurrentTrack = null;
    mockHistoryLength = 0;
    mockQueueItems = [];
    mockUseLibrary.mockReturnValue({ tracks });
  });

  it("reports no current track and no neighbors when nothing is playing", () => {
    const { result } = renderHook(() => useNowPlaying());

    expect(result.current.track).toBeNull();
    expect(result.current.hasNext).toBe(false);
    expect(result.current.hasPrevious).toBe(false);
  });

  it("resolves the current track's full display info from the library", () => {
    mockCurrentTrack = { id: 2, uri: "file:///b.flac" };
    const { result } = renderHook(() => useNowPlaying());

    expect(result.current.track?.id).toBe(2);
    expect(result.current.track?.title).toBe("Track 2");
  });

  it("treats a track no longer in the library as nothing playing", () => {
    mockCurrentTrack = { id: 999, uri: "file:///gone.flac" };
    const { result } = renderHook(() => useNowPlaying());

    expect(result.current.track).toBeNull();
  });

  it("hasNext reflects the persisted queue, not library sort order", () => {
    mockCurrentTrack = { id: 1, uri: "file:///a.flac" };
    const { result: empty } = renderHook(() => useNowPlaying());
    expect(empty.current.hasNext).toBe(false);

    mockQueueItems = [{ id: 10, track: track(2, "/b.flac") }];
    const { result: withQueue } = renderHook(() => useNowPlaying());
    expect(withQueue.current.hasNext).toBe(true);
  });

  it("hasPrevious reflects the history stack length", () => {
    const { result: empty } = renderHook(() => useNowPlaying());
    expect(empty.current.hasPrevious).toBe(false);

    mockHistoryLength = 2;
    const { result: withHistory } = renderHook(() => useNowPlaying());
    expect(withHistory.current.hasPrevious).toBe(true);
  });

  it("playNext/playPrevious delegate to the store's skipToNext/playPrevious actions", () => {
    mockQueueItems = [{ id: 10, track: track(2, "/b.flac") }];
    mockHistoryLength = 1;
    const { result } = renderHook(() => useNowPlaying());

    result.current.playNext();
    expect(mockSkipToNext).toHaveBeenCalledOnce();

    result.current.playPrevious();
    expect(mockPlayPrevious).toHaveBeenCalledOnce();
  });
});
