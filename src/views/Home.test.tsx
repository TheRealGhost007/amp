import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackListItem } from "../lib/ipc";

const listRecentMock = vi.fn();
const playNowMock = vi.fn();
const replaceWithMock = vi.fn();
const navigateMock = vi.fn();
const toggleFavoriteMock = vi.fn();

vi.mock("../lib/ipc", () => ({
  history: {
    listRecent: (...args: unknown[]) => listRecentMock(...args),
  },
  library: {
    removeTrack: vi.fn(),
  },
  pathToFileUri: (path: string) => `file://${path}`,
}));

vi.mock("../store/queueStore", () => ({
  useQueueStore: {
    getState: () => ({ replaceWith: replaceWithMock }),
  },
}));

vi.mock("../store/playbackStore", () => ({
  usePlaybackStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({ currentTrack: null }),
    { getState: () => ({ playNow: playNowMock }) },
  ),
}));

const favoritesState = { ids: new Set([2]), toggle: toggleFavoriteMock };
vi.mock("../store/favoritesStore", () => ({
  useFavoritesStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector(favoritesState),
    { getState: () => favoritesState },
  ),
}));

vi.mock("../store/navigationStore", () => ({
  useNavigationStore: (selector: (s: unknown) => unknown) =>
    selector({ navigate: navigateMock }),
}));

function track(id: number, title: string): TrackListItem {
  return {
    id,
    path: `/${title}.flac`,
    title,
    artist_id: null,
    artist_name: "Some Artist",
    album_id: null,
    album_title: null,
    album_artist: null,
    genre_name: null,
    track_number: null,
    disc_number: null,
    duration_ms: 120_000,
    year: null,
    has_embedded_art: false,
    added_at: 0,
  };
}

let libraryTracks: TrackListItem[] = [];
const refreshMock = vi.fn();
vi.mock("../context/LibraryContext", () => ({
  useLibrary: () => ({ tracks: libraryTracks, loading: false, refresh: refreshMock }),
}));

const { Home } = await import("./Home");

describe("Home", () => {
  beforeEach(() => {
    listRecentMock.mockReset().mockResolvedValue([]);
    playNowMock.mockReset().mockResolvedValue(undefined);
    replaceWithMock.mockReset().mockResolvedValue(undefined);
    navigateMock.mockReset();
    toggleFavoriteMock.mockReset();
    refreshMock.mockReset();
    libraryTracks = [];
  });

  it("shows the full empty state only when the library itself has no tracks", async () => {
    render(<Home />);

    expect(await screen.findByText("Nothing to play yet")).toBeInTheDocument();
  });

  it("shows real recently played tracks once the library has content, not the old permanent stub", async () => {
    libraryTracks = [track(1, "Track One"), track(2, "Track Two")];
    listRecentMock.mockResolvedValue([track(1, "Track One")]);

    render(<Home />);

    expect(screen.queryByText("Nothing to play yet")).not.toBeInTheDocument();
    expect(await screen.findByText("Track One")).toBeInTheDocument();
  });

  it("shows real favorited tracks, sourced from the library filtered by favoritesStore", async () => {
    libraryTracks = [track(1, "Track One"), track(2, "Track Two")];
    listRecentMock.mockResolvedValue([]);

    render(<Home />);

    // Only track id 2 is in the mocked favoritesStore's `ids`.
    expect(await screen.findByText("Track Two")).toBeInTheDocument();
  });

  it("clicking a recently played row plays it and queues the rest of that same preview list", async () => {
    libraryTracks = [track(1, "Track One"), track(2, "Track Two")];
    listRecentMock.mockResolvedValue([track(1, "Track One"), track(3, "Track Three")]);
    const user = userEvent.setup();

    render(<Home />);
    await user.click(await screen.findByText("Track One"));

    await waitFor(() =>
      expect(playNowMock).toHaveBeenCalledWith({ id: 1, uri: "file:///Track One.flac" }),
    );
    expect(replaceWithMock).toHaveBeenCalledWith([3]);
  });

  it("'See all' on Recently Played navigates to the full view", async () => {
    libraryTracks = [track(1, "Track One")];
    listRecentMock.mockResolvedValue([track(1, "Track One")]);
    const user = userEvent.setup();

    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "See all" }));

    expect(navigateMock).toHaveBeenCalledWith("recently-played");
  });

  it("shows a per-section message, not the full empty state, when the library has tracks but none are recent or favorited yet", async () => {
    libraryTracks = [track(1, "Track One")];
    listRecentMock.mockResolvedValue([]);

    render(<Home />);

    expect(screen.queryByText("Nothing to play yet")).not.toBeInTheDocument();
    expect(
      await screen.findByText("Tracks you play will show up here, most recent first."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Favorite a track and it’ll show up here."),
    ).toBeInTheDocument();
  });
});
