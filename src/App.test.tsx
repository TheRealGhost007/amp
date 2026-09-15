import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((command: string) => {
    if (command === "player_status") {
      return Promise.resolve({
        current_track: null,
        is_playing: false,
        position_ms: null,
        duration_ms: null,
      });
    }
    if (command === "get_setting") return Promise.resolve(null);
    return Promise.resolve(undefined);
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

describe("App", () => {
  it("shows Home by default with its empty state", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(await screen.findByText("Nothing to play yet")).toBeInTheDocument();
  });

  it("navigates between sidebar views without losing the shell", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Playlists" }));
    expect(screen.getByRole("heading", { name: "Playlists" })).toBeInTheDocument();
  });

  it("collapses and expands the sidebar without losing the active view", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Albums" }));
    expect(screen.getByRole("heading", { name: "Albums" })).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    await userEvent.click(toggle);

    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    // Collapsing must not unmount/remount the active view.
    expect(screen.getByRole("heading", { name: "Albums" })).toBeInTheDocument();
  });
});
