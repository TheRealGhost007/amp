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
});
