import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listMock = vi.fn();
const createMock = vi.fn();

vi.mock("../lib/ipc", () => ({
  playlists: {
    list: (...args: unknown[]) => listMock(...args),
    create: (...args: unknown[]) => createMock(...args),
    rename: vi.fn(),
    delete: vi.fn(),
    setDescription: vi.fn(),
  },
}));

const { usePlaylistsStore } = await import("../store/playlistsStore");
const { useNavigationStore } = await import("../store/navigationStore");
const { Playlists } = await import("./Playlists");

describe("Playlists", () => {
  beforeEach(() => {
    listMock.mockReset().mockResolvedValue([]);
    createMock.mockReset();
    usePlaylistsStore.setState({ items: [], loading: false });
    useNavigationStore.setState({ playlistDetailId: null });
  });

  it("typing a full name into the New Playlist dialog doesn't lose focus after each keystroke", async () => {
    // Regression test: onClose={() => setCreateOpen(false)} was a fresh
    // closure every render, and every keystroke re-rendered this view
    // (newName changing). Dialog's focus-trap effect depends on
    // [open, onClose] and refocuses the dialog's first focusable element
    // every time it re-runs, so each keystroke yanked focus away from
    // the input — a user could only ever type one letter at a time
    // before having to click back into the field.
    const user = userEvent.setup();
    render(<Playlists />);

    await user.click(screen.getByRole("button", { name: "New Playlist" }));
    const input = screen.getByLabelText("Name");

    await user.type(input, "Road Trip");

    expect(input).toHaveValue("Road Trip");
    expect(input).toHaveFocus();
  });
});
