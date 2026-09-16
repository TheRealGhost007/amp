import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toast/Toast";
import type { TrackListItem } from "../../lib/ipc";

const updateMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("../../lib/ipc", () => ({
  metadata: {
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

const track: TrackListItem = {
  id: 42,
  path: "/music/Artist/Album/01 Song.flac",
  title: "Song",
  artist_id: 1,
  artist_name: "Artist",
  album_id: 2,
  album_title: "Album",
  album_artist: "Artist",
  genre_name: "Rock",
  track_number: 1,
  disc_number: 1,
  duration_ms: 180000,
  year: 2020,
  has_embedded_art: false,
  added_at: 0,
};

vi.mock("../../context/LibraryContext", () => ({
  useLibrary: () => ({
    tracks: [track],
    refresh: (...args: unknown[]) => refreshMock(...args),
  }),
}));

const { useConfirmDialogStore } = await import("../../store/confirmDialogStore");
const { MetadataEditDialog } = await import("./MetadataEditDialog");

describe("MetadataEditDialog", () => {
  beforeEach(() => {
    updateMock.mockReset();
    refreshMock.mockReset();
    updateMock.mockResolvedValue({ ...track });
    useConfirmDialogStore.setState({ request: null });
  });

  it("pre-fills every field from the track being edited", () => {
    render(
      <ToastProvider>
        <MetadataEditDialog open trackId={42} onSaved={vi.fn()} onClose={vi.fn()} />
      </ToastProvider>,
    );

    expect(screen.getByLabelText("Title")).toHaveValue("Song");
    expect(screen.getByLabelText("Artist")).toHaveValue("Artist");
    expect(screen.getByLabelText("Album")).toHaveValue("Album");
    expect(screen.getByLabelText("Album Artist")).toHaveValue("Artist");
    expect(screen.getByLabelText("Genre")).toHaveValue("Rock");
    expect(screen.getByLabelText("Track #")).toHaveValue(1);
    expect(screen.getByLabelText("Disc #")).toHaveValue(1);
    expect(screen.getByLabelText("Year")).toHaveValue(2020);
  });

  it("asks for confirmation before writing to the file, then saves the edited fields on confirm", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MetadataEditDialog open trackId={42} onSaved={onSaved} onClose={onClose} />
      </ToastProvider>,
    );

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "New Title");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // The write hasn't happened yet — it's gated behind the shared
    // destructive-action confirmation (spec §37), not fired directly
    // from the Save button.
    expect(updateMock).not.toHaveBeenCalled();
    const request = useConfirmDialogStore.getState().request;
    expect(request).not.toBeNull();

    request?.onConfirm();
    await vi.waitFor(() => expect(updateMock).toHaveBeenCalledOnce());

    expect(updateMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        title: "New Title",
        artist: "Artist",
        album: "Album",
        album_artist: "Artist",
        genre: "Rock",
        track_number: 1,
        disc_number: 1,
        year: 2020,
        artwork: { type: "Unchanged" },
      }),
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(refreshMock).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("rejects an empty title without ever opening the confirmation dialog", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MetadataEditDialog open trackId={42} onClose={vi.fn()} />
      </ToastProvider>,
    );

    await user.clear(screen.getByLabelText("Title"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(useConfirmDialogStore.getState().request).toBeNull();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("Reset restores the fields to the track's current values after an edit", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MetadataEditDialog open trackId={42} onClose={vi.fn()} />
      </ToastProvider>,
    );

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Something else");
    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByLabelText("Title")).toHaveValue("Song");
  });
});
