import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toast/Toast";

const addTrackMock = vi.fn();
const listMock = vi.fn();
const createMock = vi.fn();

vi.mock("../../lib/ipc", () => ({
  playlists: {
    addTrack: (...args: unknown[]) => addTrackMock(...args),
    list: (...args: unknown[]) => listMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}));

const { usePlaylistsStore } = await import("../../store/playlistsStore");
const { AddToPlaylistDialog } = await import("./AddToPlaylistDialog");

function renderDialog(trackId: number | null = 42) {
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <AddToPlaylistDialog open onClose={onClose} trackId={trackId} />
    </ToastProvider>,
  );
  return { onClose };
}

describe("AddToPlaylistDialog", () => {
  beforeEach(() => {
    addTrackMock.mockReset().mockResolvedValue(undefined);
    listMock.mockReset();
    createMock.mockReset();
    usePlaylistsStore.setState({
      items: [
        { id: 1, name: "Road Trip", description: null, track_count: 5 },
        { id: 2, name: "Focus", description: null, track_count: 12 },
      ],
      loading: false,
    });
  });

  it("adding a track to an existing playlist refreshes the store's track count", async () => {
    // Regression test: addTo() called playlists.addTrack directly (a
    // raw IPC call bypassing the store entirely) with no follow-up
    // refresh — the Playlists overview's track_count for that playlist
    // stayed stale (too low by one) until some unrelated action
    // happened to trigger a refresh.
    listMock.mockResolvedValue([
      { id: 1, name: "Road Trip", description: null, track_count: 6 },
      { id: 2, name: "Focus", description: null, track_count: 12 },
    ]);
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Road Trip" }));

    expect(addTrackMock).toHaveBeenCalledWith(1, 42);
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(usePlaylistsStore.getState().items[0].track_count).toBe(6),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does nothing when no track is selected", async () => {
    const user = userEvent.setup();
    renderDialog(null);

    await user.click(screen.getByRole("button", { name: "Road Trip" }));

    expect(addTrackMock).not.toHaveBeenCalled();
    expect(listMock).not.toHaveBeenCalled();
  });

  it("creating a new playlist and adding the track refreshes the store afterward too", async () => {
    createMock.mockResolvedValue({ id: 3, name: "New Mix" });
    listMock
      .mockResolvedValueOnce([
        { id: 1, name: "Road Trip", description: null, track_count: 5 },
        { id: 2, name: "Focus", description: null, track_count: 12 },
        { id: 3, name: "New Mix", description: null, track_count: 0 },
      ])
      .mockResolvedValueOnce([
        { id: 1, name: "Road Trip", description: null, track_count: 5 },
        { id: 2, name: "Focus", description: null, track_count: 12 },
        { id: 3, name: "New Mix", description: null, track_count: 1 },
      ]);
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("New playlist"), "New Mix");
    await user.click(screen.getByRole("button", { name: "Create & Add" }));

    expect(addTrackMock).toHaveBeenCalledWith(3, 42);
    await waitFor(() => expect(usePlaylistsStore.getState().items).toHaveLength(3));
    await waitFor(() =>
      expect(usePlaylistsStore.getState().items[2].track_count).toBe(1),
    );
  });
});
