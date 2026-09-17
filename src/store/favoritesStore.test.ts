import { beforeEach, describe, expect, it, vi } from "vitest";

const listIdsMock = vi.fn();
const toggleMock = vi.fn();

vi.mock("../lib/ipc", () => ({
  favorites: {
    listIds: (...args: unknown[]) => listIdsMock(...args),
    toggle: (...args: unknown[]) => toggleMock(...args),
  },
}));

const { useFavoritesStore } = await import("./favoritesStore");

describe("favoritesStore", () => {
  beforeEach(() => {
    listIdsMock.mockReset();
    toggleMock.mockReset();
    useFavoritesStore.setState({ ids: new Set(), loading: false });
  });

  it("init loads ids into a Set", async () => {
    listIdsMock.mockResolvedValue([1, 2, 3]);

    await useFavoritesStore.getState().init();

    expect(useFavoritesStore.getState().ids).toEqual(new Set([1, 2, 3]));
  });

  it("toggle adds the id when the backend reports it's now favorited", async () => {
    toggleMock.mockResolvedValue(true);

    await useFavoritesStore.getState().toggle(5);

    expect(useFavoritesStore.getState().ids.has(5)).toBe(true);
  });

  it("toggle removes the id when the backend reports it's no longer favorited", async () => {
    useFavoritesStore.setState({ ids: new Set([5]) });
    toggleMock.mockResolvedValue(false);

    await useFavoritesStore.getState().toggle(5);

    expect(useFavoritesStore.getState().ids.has(5)).toBe(false);
  });

  it("toggle does not affect other ids already in the set", async () => {
    useFavoritesStore.setState({ ids: new Set([1, 2]) });
    toggleMock.mockResolvedValue(true);

    await useFavoritesStore.getState().toggle(3);

    expect(useFavoritesStore.getState().ids).toEqual(new Set([1, 2, 3]));
  });

  it("a slower, superseded toggle reply does not overwrite a newer toggle of the same track", async () => {
    // Regression test: Tauri dispatches non-async commands across a
    // thread pool, so double-clicking a heart icon fast enough sends two
    // overlapping toggle calls that are not guaranteed to resolve in
    // call order. Without a per-track sequence guard, the first call's
    // (now-stale) reply landing after the second's already-applied
    // result would flip the displayed favorite state back to the wrong
    // value until the next full reload.
    useFavoritesStore.setState({ ids: new Set() });
    let resolveFirst!: (value: boolean) => void;
    toggleMock.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (resolveFirst = resolve)),
    );

    const firstToggle = useFavoritesStore.getState().toggle(5);
    toggleMock.mockResolvedValueOnce(false);
    await useFavoritesStore.getState().toggle(5);
    expect(useFavoritesStore.getState().ids.has(5)).toBe(false);

    // The first call's reply finally arrives, reporting the pre-second-
    // call outcome (favorited) — must be discarded, not applied.
    resolveFirst(true);
    await firstToggle;

    expect(useFavoritesStore.getState().ids.has(5)).toBe(false);
  });

  it("overlapping toggles of two different tracks never interfere with each other", async () => {
    useFavoritesStore.setState({ ids: new Set() });
    let resolveTrack5!: (value: boolean) => void;
    toggleMock.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (resolveTrack5 = resolve)),
    );

    const toggle5 = useFavoritesStore.getState().toggle(5);
    toggleMock.mockResolvedValueOnce(true);
    await useFavoritesStore.getState().toggle(6);
    expect(useFavoritesStore.getState().ids).toEqual(new Set([6]));

    resolveTrack5(true);
    await toggle5;

    expect(useFavoritesStore.getState().ids).toEqual(new Set([5, 6]));
  });
});
