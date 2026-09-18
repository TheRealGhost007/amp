import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackListItem } from "./ipc";

const playNowMock = vi.fn();
const replaceWithMock = vi.fn();

vi.mock("../store/playbackStore", () => ({
  usePlaybackStore: { getState: () => ({ playNow: playNowMock }) },
}));
vi.mock("../store/queueStore", () => ({
  useQueueStore: { getState: () => ({ replaceWith: replaceWithMock }) },
}));

const { playListStartingAt } = await import("./playFromList");

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

describe("playListStartingAt", () => {
  beforeEach(() => {
    playNowMock.mockReset().mockResolvedValue(undefined);
    replaceWithMock.mockReset().mockResolvedValue(undefined);
  });

  it("plays the track at startIndex and queues every track after it, in order", async () => {
    const tracks = [track(1, "/a.flac"), track(2, "/b.flac"), track(3, "/c.flac")];

    await playListStartingAt(tracks, 1);

    expect(playNowMock).toHaveBeenCalledWith({ id: 2, uri: "file:///b.flac" });
    expect(replaceWithMock).toHaveBeenCalledWith([3]);
  });

  it("clicking the last track in a list queues nothing after it, but still stops replaying whatever was previously queued", async () => {
    const tracks = [track(1, "/a.flac"), track(2, "/b.flac")];

    await playListStartingAt(tracks, 1);

    expect(playNowMock).toHaveBeenCalledWith({ id: 2, uri: "file:///b.flac" });
    expect(replaceWithMock).toHaveBeenCalledWith([]);
  });

  it("does nothing for an out-of-range index", async () => {
    const tracks = [track(1, "/a.flac")];

    await playListStartingAt(tracks, 5);

    expect(playNowMock).not.toHaveBeenCalled();
    expect(replaceWithMock).not.toHaveBeenCalled();
  });
});
