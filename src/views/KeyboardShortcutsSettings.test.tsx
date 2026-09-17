import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ToastProvider } from "../components";

const { useKeyboardShortcutsStore } = await import("../store/keyboardShortcutsStore");
const { DEFAULT_BINDINGS } = await import("../keyboard/shortcuts");
const { KeyboardShortcutsSettings } = await import("./KeyboardShortcutsSettings");

function renderSettings() {
  return render(
    <ToastProvider>
      <KeyboardShortcutsSettings />
    </ToastProvider>,
  );
}

function rowFor(label: string) {
  return screen.getByText(label).closest(".op-shortcut-row") as HTMLElement;
}

describe("KeyboardShortcutsSettings", () => {
  beforeEach(() => {
    useKeyboardShortcutsStore.setState({
      bindings: { ...DEFAULT_BINDINGS },
      loaded: true,
    });
  });

  it("lists every shortcut grouped under its category heading", () => {
    renderSettings();

    expect(screen.getByRole("heading", { name: "Playback" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Navigation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.getByText("Play / Pause")).toBeInTheDocument();
    expect(screen.getByText("Go to Library")).toBeInTheDocument();
  });

  it("clicking Change and pressing a new key rebinds the shortcut", async () => {
    const user = userEvent.setup();
    renderSettings();
    const row = rowFor("Toggle favorite");

    await user.click(within(row).getByRole("button", { name: "Change" }));
    expect(within(row).getByText("Press a key…")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "g" });

    expect(useKeyboardShortcutsStore.getState().bindings.toggleFavorite).toBe("G");
    expect(within(row).getByText("G")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("rebinding to a combo already used by another shortcut shows a conflict toast and changes nothing", async () => {
    const user = userEvent.setup();
    renderSettings();
    const row = rowFor("Toggle favorite");

    await user.click(within(row).getByRole("button", { name: "Change" }));
    // "N" is already Next track's default binding.
    fireEvent.keyDown(document, { key: "n" });

    expect(useKeyboardShortcutsStore.getState().bindings.toggleFavorite).toBe(
      DEFAULT_BINDINGS.toggleFavorite,
    );
    expect(
      await screen.findByText('"N" is already bound to Next track'),
    ).toBeInTheDocument();
  });

  it("pressing Escape while listening cancels without rebinding", async () => {
    const user = userEvent.setup();
    renderSettings();
    const row = rowFor("Toggle favorite");

    await user.click(within(row).getByRole("button", { name: "Change" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(within(row).queryByText("Press a key…")).not.toBeInTheDocument();
    expect(useKeyboardShortcutsStore.getState().bindings.toggleFavorite).toBe(
      DEFAULT_BINDINGS.toggleFavorite,
    );
  });

  it("Reset on a single rebound shortcut restores just that shortcut's default", async () => {
    useKeyboardShortcutsStore.getState().rebind("toggleFavorite", "G");
    const user = userEvent.setup();
    renderSettings();
    const row = rowFor("Toggle favorite");

    await user.click(within(row).getByRole("button", { name: "Reset" }));

    expect(useKeyboardShortcutsStore.getState().bindings.toggleFavorite).toBe(
      DEFAULT_BINDINGS.toggleFavorite,
    );
    expect(within(row).queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });

  it("Reset all to defaults restores every shortcut", async () => {
    useKeyboardShortcutsStore.getState().rebind("toggleFavorite", "G");
    useKeyboardShortcutsStore.getState().rebind("next", "J");
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Reset all to defaults" }));

    expect(useKeyboardShortcutsStore.getState().bindings).toEqual(DEFAULT_BINDINGS);
  });
});
