import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const setMock = vi.fn();

vi.mock("./ipc", () => ({
  settings: {
    get: (...args: unknown[]) => getMock(...args),
    set: (...args: unknown[]) => setMock(...args),
  },
}));

const { initializeTheme, changeTheme, THEME_SETTING_KEY } = await import("./theme");

function mockMatchMedia(initialMatches: boolean) {
  const state = { matches: initialMatches };
  const listeners = new Set<() => void>();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() {
      return state.matches;
    },
    addEventListener: (_: string, handler: () => void) => listeners.add(handler),
    removeEventListener: (_: string, handler: () => void) => listeners.delete(handler),
  }));
  return {
    setMatches: (value: boolean) => {
      state.matches = value;
    },
    fireChange: () => listeners.forEach((l) => l()),
    listenerCount: () => listeners.size,
  };
}

describe("theme", () => {
  beforeEach(() => {
    getMock.mockReset();
    setMock.mockReset().mockResolvedValue(undefined);
    document.documentElement.dataset.theme = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializeTheme restores a previously saved fixed theme", async () => {
    mockMatchMedia(false);
    getMock.mockResolvedValue("amoled-dark");

    await initializeTheme();

    expect(document.documentElement.dataset.theme).toBe("amoled-dark");
  });

  it("initializeTheme falls back to resolved system theme when nothing was ever saved", async () => {
    mockMatchMedia(true);
    getMock.mockResolvedValue(null);

    await initializeTheme();

    expect(document.documentElement.dataset.theme).toBe("omarchy-dark");
  });

  it("initializeTheme falls back to system when the setting read fails", async () => {
    mockMatchMedia(false);
    getMock.mockRejectedValue(new Error("db unavailable"));

    await initializeTheme();

    expect(document.documentElement.dataset.theme).toBe("omarchy-light");
  });

  it("changeTheme applies and persists the new mode", () => {
    mockMatchMedia(false);

    changeTheme("omarchy-light");

    expect(document.documentElement.dataset.theme).toBe("omarchy-light");
    expect(setMock).toHaveBeenCalledWith(THEME_SETTING_KEY, "omarchy-light");
  });

  it("switching away from 'system' stops reacting to OS preference changes", () => {
    const media = mockMatchMedia(false);
    changeTheme("system");
    expect(media.listenerCount()).toBe(1);

    changeTheme("omarchy-dark");
    expect(document.documentElement.dataset.theme).toBe("omarchy-dark");

    // A stale "system" watcher from before the switch must not still be
    // attached, or an OS preference change after this point would
    // silently overwrite the user's explicit non-system choice.
    media.fireChange();
    expect(document.documentElement.dataset.theme).toBe("omarchy-dark");
  });

  it("a changeTheme call that lands while initializeTheme's read is still in flight is not reverted by initializeTheme's late apply", async () => {
    // Regression test: initializeTheme() awaits an IPC round-trip before
    // applying anything. If the user opens Settings and picks a theme
    // (changeTheme, always synchronous) before that read resolves, the
    // read's stale saved value previously landed last and silently
    // reverted the user's own just-made choice.
    mockMatchMedia(false);
    let resolveGet!: (value: string | null) => void;
    getMock.mockReturnValueOnce(new Promise((resolve) => (resolveGet = resolve)));

    const initPromise = initializeTheme();
    changeTheme("amoled-dark");
    expect(document.documentElement.dataset.theme).toBe("amoled-dark");

    // initializeTheme's read finally resolves with the old saved value
    // (from before the user's change) — must not overwrite it.
    resolveGet("omarchy-light");
    await initPromise;

    expect(document.documentElement.dataset.theme).toBe("amoled-dark");
  });

  it("staying on 'system' keeps the theme synced with OS preference changes", () => {
    const media = mockMatchMedia(false);
    changeTheme("system");
    expect(document.documentElement.dataset.theme).toBe("omarchy-light");

    media.setMatches(true);
    media.fireChange();

    expect(document.documentElement.dataset.theme).toBe("omarchy-dark");
  });
});
