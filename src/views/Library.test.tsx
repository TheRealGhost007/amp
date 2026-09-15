import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackListItem } from "../lib/ipc";

const searchMock = vi.fn();

// jsdom reports a zero-size scroll container, so @tanstack/react-virtual
// would otherwise consider every row "not visible" and render nothing —
// this fake always renders every item, which is all this test needs.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({
    count,
    estimateSize,
  }: {
    count: number;
    estimateSize: () => number;
  }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * estimateSize(),
        size: estimateSize(),
        key: index,
      })),
  }),
}));

vi.mock("../lib/ipc", () => ({
  library: {
    search: (...args: unknown[]) => searchMock(...args),
  },
  pathToFileUri: (path: string) => `file://${path}`,
}));

vi.mock("../context/LibraryContext", () => ({
  useLibrary: () => ({
    tracks: [
      {
        id: 999,
        path: "/existing.flac",
        title: "Existing Track",
        artist_name: null,
        album_title: null,
        genre_name: null,
        track_number: null,
        disc_number: null,
        duration_ms: 1000,
        year: null,
        has_embedded_art: false,
        added_at: 0,
      },
    ],
    albums: [],
    artists: [],
    loading: false,
    addFolder: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("../store/playbackStore", () => ({
  usePlaybackStore: (selector: (s: unknown) => unknown) =>
    selector({ currentTrack: null, playNow: vi.fn() }),
}));

const { Library } = await import("./Library");

function track(id: number, title: string): TrackListItem {
  return {
    id,
    path: `/${title}.flac`,
    title,
    artist_name: null,
    album_title: null,
    genre_name: null,
    track_number: null,
    disc_number: null,
    duration_ms: 1000,
    year: null,
    has_embedded_art: false,
    added_at: 0,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Library search", () => {
  beforeEach(() => {
    searchMock.mockReset();
  });

  it("keeps the newer query's results even if the older query's reply arrives later", async () => {
    // Regression test: typing "cat" (search fires), then "cats" before
    // the first reply resolves, could show "cat"'s stale results if its
    // reply arrived after "cats"'s — same race class as playbackStore.
    const catReply = deferred<TrackListItem[]>();
    const catsReply = deferred<TrackListItem[]>();
    searchMock.mockImplementation((query: string) =>
      query === "cat" ? catReply.promise : catsReply.promise,
    );

    const user = userEvent.setup();
    render(<Library />);

    const input = screen.getByPlaceholderText("Search your library…");
    await user.type(input, "cat");
    await wait(250); // past the 200ms debounce — search("cat") fires
    await user.type(input, "s");
    await wait(250); // past the debounce — search("cats") fires

    // Newer query's reply arrives first...
    catsReply.resolve([track(2, "Cats Track")]);
    await waitFor(() => expect(screen.getByText("Cats Track")).toBeInTheDocument());
    // ...then the older, now-superseded query's reply arrives late.
    catReply.resolve([track(1, "Cat Track")]);
    await wait(50);

    expect(screen.getByText("Cats Track")).toBeInTheDocument();
    expect(screen.queryByText("Cat Track")).not.toBeInTheDocument();
  });
});
