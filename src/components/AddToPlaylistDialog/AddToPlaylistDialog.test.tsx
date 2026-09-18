import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("clicking a playlist row twice before the first add resolves only adds the track once", async () => {
    // Regression test: neither click handler disabled anything while its
    // own IPC call was in flight, so a second click on the same (or a
    // different) playlist row before the first `addTrack` resolved could
    // fire a second, unintended add.
    let resolveAdd!: () => void;
    addTrackMock.mockReturnValueOnce(
      new Promise<void>((resolve) => (resolveAdd = resolve)),
    );
    listMock.mockResolvedValue([
      { id: 1, name: "Road Trip", description: null, track_count: 6 },
      { id: 2, name: "Focus", description: null, track_count: 12 },
    ]);
    const { onClose } = renderDialog();

    const row = screen.getByRole("button", { name: "Road Trip" });
    fireEvent.click(row);
    fireEvent.click(row);

    expect(addTrackMock).toHaveBeenCalledTimes(1);
    resolveAdd();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    await waitFor(() => expect(listMock).toHaveBeenCalled());
  });

  it("clicking Create & Add twice before the first create resolves only creates one playlist", async () => {
    let resolveCreate!: (value: { id: number; name: string }) => void;
    createMock.mockReturnValueOnce(new Promise((resolve) => (resolveCreate = resolve)));
    listMock.mockResolvedValue([
      { id: 1, name: "Road Trip", description: null, track_count: 5 },
      { id: 2, name: "Focus", description: null, track_count: 12 },
      { id: 3, name: "New Mix", description: null, track_count: 1 },
    ]);
    const onClose = vi.fn();
    render(
      <ToastProvider>
        <AddToPlaylistDialog open onClose={onClose} trackId={42} />
      </ToastProvider>,
    );

    await userEvent.setup().type(screen.getByLabelText("New playlist"), "New Mix");
    const button = screen.getByRole("button", { name: "Create & Add" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(createMock).toHaveBeenCalledTimes(1);
    resolveCreate({ id: 3, name: "New Mix" });
    await waitFor(() => expect(addTrackMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    await waitFor(() => expect(listMock).toHaveBeenCalled());
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
