import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const setMock = vi.fn();

vi.mock("../lib/ipc", () => ({
  settings: {
    get: (...args: unknown[]) => getMock(...args),
    set: (...args: unknown[]) => setMock(...args),
  },
}));

const { useKeyboardShortcutsStore } = await import("./keyboardShortcutsStore");
const { DEFAULT_BINDINGS } = await import("../keyboard/shortcuts");

describe("keyboardShortcutsStore", () => {
  beforeEach(() => {
    getMock.mockReset();
    setMock.mockReset().mockResolvedValue(undefined);
    useKeyboardShortcutsStore.setState({
      bindings: { ...DEFAULT_BINDINGS },
      loaded: false,
    });
  });

  it("starts with every shortcut's default binding", () => {
    expect(useKeyboardShortcutsStore.getState().bindings.playPause).toBe("Space");
    expect(useKeyboardShortcutsStore.getState().bindings.commandPalette).toBe("Ctrl+K");
  });

  it("init loads saved bindings, merged over the defaults", async () => {
    getMock.mockResolvedValue({ playPause: "Ctrl+Space" });

    await useKeyboardShortcutsStore.getState().init();

    expect(useKeyboardShortcutsStore.getState().bindings.playPause).toBe("Ctrl+Space");
    // A shortcut absent from the saved partial keeps its default.
    expect(useKeyboardShortcutsStore.getState().bindings.next).toBe("N");
  });

  it("init tolerates no saved bindings existing yet", async () => {
    getMock.mockResolvedValue(null);

    await useKeyboardShortcutsStore.getState().init();

    expect(useKeyboardShortcutsStore.getState().bindings).toEqual(DEFAULT_BINDINGS);
    expect(useKeyboardShortcutsStore.getState().loaded).toBe(true);
  });

  it("init tolerates a failed settings read", async () => {
    getMock.mockRejectedValue(new Error("boom"));

    await useKeyboardShortcutsStore.getState().init();

    expect(useKeyboardShortcutsStore.getState().loaded).toBe(true);
  });

  it("rebind changes the binding and persists it", () => {
    const ok = useKeyboardShortcutsStore.getState().rebind("playPause", "Ctrl+Space");

    expect(ok).toBe(true);
    expect(useKeyboardShortcutsStore.getState().bindings.playPause).toBe("Ctrl+Space");
    expect(setMock).toHaveBeenCalledWith(
      "keyboard.bindings",
      expect.objectContaining({ playPause: "Ctrl+Space" }),
    );
  });

  it("rebind refuses a combo already bound to a different shortcut", () => {
    const ok = useKeyboardShortcutsStore.getState().rebind("next", "P");

    expect(ok).toBe(false);
    // Nothing changed and nothing was persisted.
    expect(useKeyboardShortcutsStore.getState().bindings.next).toBe("N");
    expect(setMock).not.toHaveBeenCalled();
  });

  it("rebind allows a shortcut to keep its own current combo", () => {
    const ok = useKeyboardShortcutsStore.getState().rebind("next", "N");
    expect(ok).toBe(true);
  });

  it("resetToDefault reverts just one shortcut", () => {
    useKeyboardShortcutsStore.getState().rebind("playPause", "Ctrl+Space");
    useKeyboardShortcutsStore.getState().rebind("next", "Ctrl+N");

    useKeyboardShortcutsStore.getState().resetToDefault("playPause");

    expect(useKeyboardShortcutsStore.getState().bindings.playPause).toBe("Space");
    expect(useKeyboardShortcutsStore.getState().bindings.next).toBe("Ctrl+N");
  });

  it("resetAllToDefaults reverts every shortcut", () => {
    useKeyboardShortcutsStore.getState().rebind("playPause", "Ctrl+Space");
    useKeyboardShortcutsStore.getState().rebind("next", "Ctrl+N");

    useKeyboardShortcutsStore.getState().resetAllToDefaults();

    expect(useKeyboardShortcutsStore.getState().bindings).toEqual(DEFAULT_BINDINGS);
  });
});
