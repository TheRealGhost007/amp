import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toggleCommandPaletteMock = vi.fn();
const navigateMock = vi.fn();
const togglePlayPauseMock = vi.fn();
const collapseMock = vi.fn();

vi.mock("../store/commandPaletteStore", () => ({
  useCommandPaletteStore: { getState: () => ({ toggle: toggleCommandPaletteMock }) },
}));
vi.mock("../store/navigationStore", () => ({
  useNavigationStore: { getState: () => ({ navigate: navigateMock }) },
}));
vi.mock("../store/playerViewStore", () => ({
  usePlayerViewStore: { getState: () => ({ collapse: collapseMock }) },
}));
vi.mock("../store/playbackStore", () => ({
  usePlaybackStore: {
    getState: () => ({
      togglePlayPause: togglePlayPauseMock,
      positionMs: 0,
      durationMs: null,
      volume: 1,
      seek: vi.fn(),
      setVolume: vi.fn(),
      skipToNext: vi.fn(),
      playPrevious: vi.fn(),
      toggleFavorite: vi.fn(),
    }),
  },
}));

const { useKeyboardShortcutsStore } = await import("../store/keyboardShortcutsStore");
const { DEFAULT_BINDINGS } = await import("./shortcuts");
const { GlobalShortcuts } = await import("./GlobalShortcuts");

describe("GlobalShortcuts", () => {
  beforeEach(() => {
    toggleCommandPaletteMock.mockReset();
    navigateMock.mockReset();
    togglePlayPauseMock.mockReset();
    collapseMock.mockReset();
    useKeyboardShortcutsStore.setState({
      bindings: { ...DEFAULT_BINDINGS },
      loaded: true,
    });
    document.body.innerHTML = "";
  });

  it("dispatches the bound action for a plain key press", () => {
    render(<GlobalShortcuts />);

    fireEvent.keyDown(document, { key: " " });

    expect(togglePlayPauseMock).toHaveBeenCalledOnce();
  });

  it("dispatches a rebound combo, not the old default", () => {
    useKeyboardShortcutsStore.getState().rebind("commandPalette", "Ctrl+P");
    render(<GlobalShortcuts />);

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(toggleCommandPaletteMock).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "p", ctrlKey: true });
    expect(toggleCommandPaletteMock).toHaveBeenCalledOnce();
  });

  it("ignores a bare-letter shortcut while a text field is focused", () => {
    render(<GlobalShortcuts />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(document, { key: "l" });

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("still fires a Ctrl-modified shortcut while a text field is focused", () => {
    render(<GlobalShortcuts />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    expect(toggleCommandPaletteMock).toHaveBeenCalledOnce();
  });

  it("does not fire when another handler already called preventDefault", () => {
    // A real `defaultPrevented` can only come from an actual
    // `preventDefault()` call, not an event-init property — register a
    // listener that does that, ahead of `GlobalShortcuts`'s own (same
    // node, so bubble-phase listeners run in registration order), to
    // simulate a more specific component (`Menu`, `CommandPalette`)
    // already having claimed this keystroke.
    const preventer = (e: KeyboardEvent) => e.preventDefault();
    document.addEventListener("keydown", preventer);
    render(<GlobalShortcuts />);

    fireEvent.keyDown(document, { key: "l" });

    document.removeEventListener("keydown", preventer);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("navigates to Library for the default L binding", () => {
    render(<GlobalShortcuts />);

    fireEvent.keyDown(document, { key: "l" });

    expect(navigateMock).toHaveBeenCalledWith("library");
  });

  it("collapses the full player on Escape", () => {
    render(<GlobalShortcuts />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(collapseMock).toHaveBeenCalledOnce();
  });
});
