import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Routed by key rather than one blanket resolved value: `initializeTheme`
// now reads THEME_SETTING_KEY, and — independently — always also checks
// BACKGROUND_IMAGE_SETTING_KEY (and CUSTOM_THEME_SETTING_KEY when the
// saved mode is "custom"). A single shared mocked value across all three
// would make a saved theme *mode* string get misread as an image *path*.
const settingsStore = new Map<string, unknown>();
const getMock = vi.fn((key: string) => Promise.resolve(settingsStore.get(key) ?? null));
const setMock = vi.fn();
const readAsDataUrlMock = vi.fn();

vi.mock("./ipc", () => ({
  settings: {
    get: (key: string) => getMock(key),
    set: (...args: unknown[]) => setMock(...args),
  },
  images: {
    readAsDataUrl: (...args: unknown[]) => readAsDataUrlMock(...args),
  },
}));

const {
  initializeTheme,
  changeTheme,
  setBackgroundImage,
  THEME_SETTING_KEY,
  CUSTOM_THEME_SETTING_KEY,
  BACKGROUND_IMAGE_SETTING_KEY,
} = await import("./theme");

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
    settingsStore.clear();
    getMock.mockClear();
    setMock.mockReset().mockResolvedValue(undefined);
    readAsDataUrlMock.mockReset();
    document.documentElement.dataset.theme = "";
    document.body.style.background = "";
    document.documentElement.style.cssText = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializeTheme restores a previously saved fixed theme", async () => {
    mockMatchMedia(false);
    settingsStore.set(THEME_SETTING_KEY, "amoled-dark");

    await initializeTheme();

    expect(document.documentElement.dataset.theme).toBe("amoled-dark");
  });

  it("initializeTheme falls back to resolved system theme when nothing was ever saved", async () => {
    mockMatchMedia(true);

    await initializeTheme();

    expect(document.documentElement.dataset.theme).toBe("omarchy-dark");
  });

  it("initializeTheme falls back to system when the setting read fails", async () => {
    mockMatchMedia(false);
    getMock.mockRejectedValueOnce(new Error("db unavailable"));

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

describe("custom theme", () => {
  beforeEach(async () => {
    settingsStore.clear();
    getMock.mockClear();
    setMock.mockReset().mockResolvedValue(undefined);
    readAsDataUrlMock.mockReset();
    document.documentElement.dataset.theme = "";
    document.documentElement.style.cssText = "";
    // `currentBackgroundImage`/`currentGradient` are module-level state
    // in theme.ts (by design — a background image must survive a theme
    // change independent of it), so they persist across test cases
    // within this file unless explicitly cleared here.
    await setBackgroundImage(null);
    mockMatchMedia(false);
  });

  it("applies the picked base theme plus the accent and gradient as inline overrides", () => {
    changeTheme("custom", {
      base: "omarchy-dark",
      gradientFrom: "#1a1a2e",
      gradientTo: "#16213e",
      angle: 135,
      accent: "#e94560",
    });

    expect(document.documentElement.dataset.theme).toBe("omarchy-dark");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#e94560");
    // jsdom's CSSOM normalizes hex colors it parses back out of a
    // shorthand `background` value to rgb() — assert on the gradient's
    // structure (angle + two distinct color stops), not the literal hex
    // text, since jsdom's own normalization isn't this test's concern.
    expect(document.body.style.background).toContain("linear-gradient(135deg");
    expect(document.body.style.background).toContain("rgb(26, 26, 46)");
    expect(document.body.style.background).toContain("rgb(22, 33, 62)");
  });

  it("persists both the mode and the custom config", () => {
    const config = {
      base: "omarchy-light" as const,
      gradientFrom: "#ffffff",
      gradientTo: "#000000",
      angle: 90,
      accent: "#336699",
    };
    changeTheme("custom", config);

    expect(setMock).toHaveBeenCalledWith(THEME_SETTING_KEY, "custom");
    expect(setMock).toHaveBeenCalledWith(CUSTOM_THEME_SETTING_KEY, config);
  });

  it("picks a dark label color for a light accent and a light label color for a dark accent", () => {
    changeTheme("custom", {
      base: "omarchy-dark",
      gradientFrom: "#000",
      gradientTo: "#000",
      angle: 0,
      accent: "#ffffff",
    });
    expect(document.documentElement.style.getPropertyValue("--on-accent")).toBe(
      "#121212",
    );

    changeTheme("custom", {
      base: "omarchy-dark",
      gradientFrom: "#000",
      gradientTo: "#000",
      angle: 0,
      accent: "#0a0a0a",
    });
    expect(document.documentElement.style.getPropertyValue("--on-accent")).toBe(
      "#ffffff",
    );
  });

  it("switching away from custom clears the accent/gradient overrides", () => {
    changeTheme("custom", {
      base: "omarchy-dark",
      gradientFrom: "#111",
      gradientTo: "#222",
      angle: 45,
      accent: "#abcdef",
    });
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#abcdef");

    changeTheme("omarchy-dark");

    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("");
    expect(document.body.style.background).toBe("");
  });

  it("initializeTheme restores a saved custom theme's config, not just its mode", async () => {
    settingsStore.set(THEME_SETTING_KEY, "custom");
    settingsStore.set(CUSTOM_THEME_SETTING_KEY, {
      base: "omarchy-light",
      gradientFrom: "#fafafa",
      gradientTo: "#eaeaea",
      angle: 180,
      accent: "#ff6600",
    });

    await initializeTheme();

    expect(document.documentElement.dataset.theme).toBe("omarchy-light");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#ff6600");
    expect(document.body.style.background).toContain("180deg");
  });

  it("falls back to system if the mode is 'custom' but its config is missing", async () => {
    settingsStore.set(THEME_SETTING_KEY, "custom");

    await initializeTheme();

    expect(document.documentElement.dataset.theme).toBe("omarchy-light");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("");
  });
});

describe("custom background image", () => {
  beforeEach(async () => {
    settingsStore.clear();
    getMock.mockClear();
    setMock.mockReset().mockResolvedValue(undefined);
    readAsDataUrlMock.mockReset();
    document.documentElement.dataset.theme = "";
    document.documentElement.style.cssText = "";
    // Module-level state in theme.ts persists across test cases within
    // this file — clear it, then reset the mocks again so this cleanup
    // call itself doesn't show up in a test's own assertions.
    await setBackgroundImage(null);
    setMock.mockClear();
    mockMatchMedia(false);
  });

  it("reads the picked file and applies it as body's background with a readability scrim", async () => {
    readAsDataUrlMock.mockResolvedValue("data:image/png;base64,ZmFrZQ==");

    await setBackgroundImage("/home/user/Pictures/wallpaper.png");

    expect(readAsDataUrlMock).toHaveBeenCalledWith("/home/user/Pictures/wallpaper.png");
    expect(document.body.style.background).toContain("data:image/png;base64,ZmFrZQ==");
    expect(document.body.style.background).toContain("rgba(0, 0, 0, 0.55)");
    expect(setMock).toHaveBeenCalledWith(
      BACKGROUND_IMAGE_SETTING_KEY,
      "/home/user/Pictures/wallpaper.png",
    );
  });

  it("clearing the background image resets body's background to the stylesheet default", async () => {
    readAsDataUrlMock.mockResolvedValue("data:image/png;base64,ZmFrZQ==");
    await setBackgroundImage("/home/user/Pictures/wallpaper.png");

    await setBackgroundImage(null);

    expect(document.body.style.background).toBe("");
    expect(setMock).toHaveBeenCalledWith(BACKGROUND_IMAGE_SETTING_KEY, null);
  });

  it("a background image takes priority over a custom theme's gradient", async () => {
    changeTheme("custom", {
      base: "omarchy-dark",
      gradientFrom: "#111",
      gradientTo: "#222",
      angle: 45,
      accent: "#abcdef",
    });
    expect(document.body.style.background).toContain("linear-gradient(45deg");

    readAsDataUrlMock.mockResolvedValue("data:image/png;base64,ZmFrZQ==");
    await setBackgroundImage("/wallpaper.png");

    expect(document.body.style.background).toContain("data:image/png;base64,ZmFrZQ==");
    expect(document.body.style.background).not.toContain("#111");
  });

  it("initializeTheme restores a previously set background image from disk", async () => {
    settingsStore.set(BACKGROUND_IMAGE_SETTING_KEY, "/wallpaper.png");
    readAsDataUrlMock.mockResolvedValue("data:image/png;base64,cmVzdG9yZWQ=");

    await initializeTheme();

    expect(readAsDataUrlMock).toHaveBeenCalledWith("/wallpaper.png");
    expect(document.body.style.background).toContain("cmVzdG9yZWQ=");
  });

  it("a moved/deleted background image file fails initializeTheme silently, not blocking the theme itself", async () => {
    settingsStore.set(THEME_SETTING_KEY, "omarchy-light");
    settingsStore.set(BACKGROUND_IMAGE_SETTING_KEY, "/gone.png");
    readAsDataUrlMock.mockRejectedValue(new Error("ENOENT"));

    await expect(initializeTheme()).resolves.toBeUndefined();

    expect(document.documentElement.dataset.theme).toBe("omarchy-light");
    expect(document.body.style.background).toBe("");
  });
});
