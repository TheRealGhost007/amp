import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaylistSummary } from "../lib/ipc";

const listMock = vi.fn();
const createMock = vi.fn();
const renameMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("../lib/ipc", () => ({
  playlists: {
    list: (...args: unknown[]) => listMock(...args),
    create: (...args: unknown[]) => createMock(...args),
    rename: (...args: unknown[]) => renameMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
    setDescription: vi.fn(),
  },
}));

const { usePlaylistsStore } = await import("./playlistsStore");

function summary(id: number, name: string): PlaylistSummary {
  return { id, name, description: null, track_count: 0 };
}

describe("playlistsStore", () => {
  beforeEach(() => {
    listMock.mockReset();
    createMock.mockReset();
    renameMock.mockReset();
    deleteMock.mockReset();
    usePlaylistsStore.setState({ items: [], loading: false });
  });

  it("create refetches the list and returns the new playlist's id", async () => {
    createMock.mockResolvedValue({ id: 5, name: "Road Trip" });
    listMock.mockResolvedValue([summary(5, "Road Trip")]);

    const id = await usePlaylistsStore.getState().create("Road Trip");

    expect(id).toBe(5);
    expect(usePlaylistsStore.getState().items).toEqual([summary(5, "Road Trip")]);
  });

  it("remove drops the playlist from state without a full refetch", async () => {
    usePlaylistsStore.setState({ items: [summary(1, "A"), summary(2, "B")] });

    await usePlaylistsStore.getState().remove(1);

    expect(deleteMock).toHaveBeenCalledWith(1);
    expect(usePlaylistsStore.getState().items).toEqual([summary(2, "B")]);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("rename refetches the list to pick up the new name", async () => {
    listMock.mockResolvedValue([summary(1, "Renamed")]);

    await usePlaylistsStore.getState().rename(1, "Renamed");

    expect(renameMock).toHaveBeenCalledWith(1, "Renamed");
    expect(usePlaylistsStore.getState().items).toEqual([summary(1, "Renamed")]);
  });
});
