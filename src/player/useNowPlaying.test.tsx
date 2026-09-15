import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackListItem, TrackRef } from "../lib/ipc";
import { useNowPlaying } from "./useNowPlaying";

const mockUseLibrary = vi.fn();
vi.mock("../context/LibraryContext", () => ({
  useLibrary: () => mockUseLibrary(),
}));

const mockPlayNow = vi.fn();
let mockCurrentTrack: TrackRef | null = null;
vi.mock("../store/playbackStore", () => ({
  usePlaybackStore: (selector: (s: unknown) => unknown) =>
    selector({ currentTrack: mockCurrentTrack, playNow: mockPlayNow }),
}));

function track(id: number, path: string): TrackListItem {
  return {
    id,
    path,
    title: `Track ${id}`,
    artist_name: null,
    album_title: null,
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
    mockPlayNow.mockReset();
    mockCurrentTrack = null;
    mockUseLibrary.mockReturnValue({ tracks });
  });

  it("reports no current track and no neighbors when nothing is playing", () => {
    const { result } = renderHook(() => useNowPlaying());

    expect(result.current.track).toBeNull();
    expect(result.current.hasNext).toBe(false);
    expect(result.current.hasPrevious).toBe(false);
  });

  it("finds the current track and both neighbors from the middle of the list", () => {
    mockCurrentTrack = { id: 2, uri: "file:///b.flac" };
    const { result } = renderHook(() => useNowPlaying());

    expect(result.current.track?.id).toBe(2);
    expect(result.current.hasNext).toBe(true);
    expect(result.current.hasPrevious).toBe(true);
  });

  it("has no previous at the start of the list and no next at the end", () => {
    mockCurrentTrack = { id: 1, uri: "file:///a.flac" };
    const { result: first } = renderHook(() => useNowPlaying());
    expect(first.current.hasPrevious).toBe(false);
    expect(first.current.hasNext).toBe(true);

    mockCurrentTrack = { id: 3, uri: "file:///c.flac" };
    const { result: last } = renderHook(() => useNowPlaying());
    expect(last.current.hasPrevious).toBe(true);
    expect(last.current.hasNext).toBe(false);
  });

  it("treats a track no longer in the library as nothing playing", () => {
    mockCurrentTrack = { id: 999, uri: "file:///gone.flac" };
    const { result } = renderHook(() => useNowPlaying());

    expect(result.current.track).toBeNull();
    expect(result.current.hasNext).toBe(false);
    expect(result.current.hasPrevious).toBe(false);
  });

  it("playNext/playPrevious call playNow with the neighboring track's file URI", () => {
    mockCurrentTrack = { id: 2, uri: "file:///b.flac" };
    const { result } = renderHook(() => useNowPlaying());

    result.current.playNext();
    expect(mockPlayNow).toHaveBeenCalledWith({ id: 3, uri: "file:///c.flac" });

    result.current.playPrevious();
    expect(mockPlayNow).toHaveBeenCalledWith({ id: 1, uri: "file:///a.flac" });
  });
});
