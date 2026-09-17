import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listScanRootsMock = vi.fn();
const removeScanRootMock = vi.fn();
const addFolderMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("../lib/ipc", () => ({
  library: {
    listScanRoots: (...args: unknown[]) => listScanRootsMock(...args),
    removeScanRoot: (...args: unknown[]) => removeScanRootMock(...args),
  },
}));

vi.mock("../context/LibraryContext", () => ({
  useLibrary: () => ({
    addFolder: addFolderMock,
    refresh: refreshMock,
  }),
}));

const { LibrarySettings } = await import("./LibrarySettings");

describe("LibrarySettings", () => {
  beforeEach(() => {
    listScanRootsMock.mockReset();
    removeScanRootMock.mockReset().mockResolvedValue(undefined);
    addFolderMock.mockReset();
    refreshMock.mockReset();
  });

  it("shows an empty-state note when no folders have been added yet", async () => {
    listScanRootsMock.mockResolvedValue([]);

    render(<LibrarySettings />);

    expect(await screen.findByText("No music folders added yet.")).toBeInTheDocument();
  });

  it("lists every configured scan root", async () => {
    listScanRootsMock.mockResolvedValue(["/music/rock", "/music/jazz"]);

    render(<LibrarySettings />);

    expect(await screen.findByText("/music/rock")).toBeInTheDocument();
    expect(screen.getByText("/music/jazz")).toBeInTheDocument();
  });

  it("removing a folder calls the backend and refreshes both the roots list and the library", async () => {
    listScanRootsMock.mockResolvedValue(["/music/rock"]);
    const user = userEvent.setup();

    render(<LibrarySettings />);
    await screen.findByText("/music/rock");
    listScanRootsMock.mockResolvedValue([]);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(removeScanRootMock).toHaveBeenCalledWith("/music/rock"));
    expect(refreshMock).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByText("No music folders added yet.")).toBeInTheDocument(),
    );
  });

  it("Add Folder delegates to the library context and refreshes the roots list", async () => {
    listScanRootsMock.mockResolvedValue([]);
    addFolderMock.mockResolvedValue(null);
    const user = userEvent.setup();

    render(<LibrarySettings />);
    await screen.findByText("No music folders added yet.");

    await user.click(screen.getByRole("button", { name: "Add Folder…" }));

    await waitFor(() => expect(addFolderMock).toHaveBeenCalled());
  });
});
