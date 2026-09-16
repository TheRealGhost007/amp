import { beforeEach, describe, expect, it, vi } from "vitest";

const playNowMock = vi.fn();
const isFavoriteMock = vi.fn();
let mprisTransportHandler: ((command: "Next" | "Previous") => void) | null = null;

vi.mock("../lib/ipc", () => ({
  player: {
    status: vi.fn().mockResolvedValue({
      current_track: null,
      is_playing: false,
      position_ms: null,
      duration_ms: null,
    }),
    playNow: (...args: unknown[]) => playNowMock(...args),
    pause: vi.fn(),
    resume: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    setNext: vi.fn(),
  },
  favorites: {
    isFavorite: (...args: unknown[]) => isFavoriteMock(...args),
    toggle: vi.fn(),
  },
  history: {
    recordPlayed: vi.fn().mockResolvedValue(undefined),
  },
  pathToFileUri: (path: string) => `file://${path}`,
  onPlayerEvent: vi.fn().mockResolvedValue(() => {}),
  onPlayerPosition: vi.fn().mockResolvedValue(() => {}),
  onMprisTransport: vi.fn((handler: (command: "Next" | "Previous") => void) => {
    mprisTransportHandler = handler;
    return Promise.resolve(() => {});
  }),
}));

// playbackStore's playTrack re-arms the backend's `next` from the queue
// after every playNow/playPrevious — irrelevant to the race-guard
// behavior these tests exercise, so stubbed out entirely. `items`
// defaults empty; the MPRIS-transport describe block below overrides it
// via `useQueueStore.getState().items` reassignment where it matters.
const mockQueueState = {
  items: [] as { id: number; track: { id: number; path: string } }[],
  syncNext: vi.fn(),
  consumeHead: vi.fn(),
};
vi.mock("./queueStore", () => ({
  useQueueStore: { getState: () => mockQueueState },
}));

const { usePlaybackStore } = await import("./playbackStore");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("playbackStore.playNow race guard", () => {
  beforeEach(() => {
    playNowMock.mockReset();
    isFavoriteMock.mockReset().mockResolvedValue(false);
    usePlaybackStore.setState({
      currentTrack: null,
      isPlaying: false,
      isFavorite: false,
    });
  });

  it("keeps the most-recently-initiated call's track even if its backend reply arrives first, discarding a slower now-superseded call's reply", async () => {
    // Simulates a user double-clicking Next: Tauri dispatches non-async
    // commands across a thread pool, so two overlapping player_play_now
    // invocations are not guaranteed to reply in call order.
    const first = deferred<void>();
    const second = deferred<void>();
    playNowMock.mockImplementationOnce(() => first.promise);
    playNowMock.mockImplementationOnce(() => second.promise);

    const trackA = { id: 1, uri: "file:///a.flac" };
    const trackB = { id: 2, uri: "file:///b.flac" };

    const p1 = usePlaybackStore.getState().playNow(trackA);
    const p2 = usePlaybackStore.getState().playNow(trackB);

    second.resolve();
    await p2;
    first.resolve();
    await p1;

    expect(usePlaybackStore.getState().currentTrack).toEqual(trackB);
  });

  it("applies the result in call order when replies arrive in call order", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    playNowMock.mockImplementationOnce(() => first.promise);
    playNowMock.mockImplementationOnce(() => second.promise);

    const trackA = { id: 1, uri: "file:///a.flac" };
    const trackB = { id: 2, uri: "file:///b.flac" };

    const p1 = usePlaybackStore.getState().playNow(trackA);
    const p2 = usePlaybackStore.getState().playNow(trackB);

    first.resolve();
    await p1;
    second.resolve();
    await p2;

    expect(usePlaybackStore.getState().currentTrack).toEqual(trackB);
  });
});

describe("playbackStore history / playPrevious", () => {
  const trackA = { id: 1, uri: "file:///a.flac" };
  const trackB = { id: 2, uri: "file:///b.flac" };
  const trackC = { id: 3, uri: "file:///c.flac" };

  beforeEach(() => {
    playNowMock.mockReset().mockResolvedValue(undefined);
    isFavoriteMock.mockReset().mockResolvedValue(false);
    usePlaybackStore.setState({
      currentTrack: null,
      isPlaying: false,
      isFavorite: false,
      history: [],
    });
  });

  it("pushes the outgoing track onto history on playNow, most recent first", async () => {
    await usePlaybackStore.getState().playNow(trackA);
    await usePlaybackStore.getState().playNow(trackB);
    await usePlaybackStore.getState().playNow(trackC);

    expect(usePlaybackStore.getState().history).toEqual([trackB, trackA]);
  });

  it("steps backward through history without re-pushing the track being left, so repeated Previous walks further back instead of oscillating", async () => {
    await usePlaybackStore.getState().playNow(trackA);
    await usePlaybackStore.getState().playNow(trackB);
    await usePlaybackStore.getState().playNow(trackC);

    await usePlaybackStore.getState().playPrevious();
    expect(usePlaybackStore.getState().currentTrack).toEqual(trackB);
    expect(usePlaybackStore.getState().history).toEqual([trackA]);

    await usePlaybackStore.getState().playPrevious();
    expect(usePlaybackStore.getState().currentTrack).toEqual(trackA);
    expect(usePlaybackStore.getState().history).toEqual([]);
  });

  it("does nothing when history is empty", async () => {
    await usePlaybackStore.getState().playPrevious();
    expect(playNowMock).not.toHaveBeenCalled();
    expect(usePlaybackStore.getState().currentTrack).toBeNull();
  });
});

describe("playbackStore.init MPRIS transport routing", () => {
  const trackA = { id: 1, uri: "file:///a.flac" };
  const trackB = { id: 2, uri: "file:///b.flac" };

  beforeEach(() => {
    playNowMock.mockReset().mockResolvedValue(undefined);
    isFavoriteMock.mockReset().mockResolvedValue(false);
    mprisTransportHandler = null;
    mockQueueState.items = [];
    usePlaybackStore.setState({
      currentTrack: null,
      isPlaying: false,
      isFavorite: false,
      history: [],
    });
  });

  it("routes an MPRIS Next command to skipToNext, since the queue it needs lives only in this frontend", async () => {
    mockQueueState.items = [{ id: 10, track: { id: 5, path: "/music/next.flac" } }];
    await usePlaybackStore.getState().init();

    mprisTransportHandler?.("Next");
    await Promise.resolve();
    await Promise.resolve();

    expect(playNowMock).toHaveBeenCalledWith({ id: 5, uri: "file:///music/next.flac" });
  });

  it("routes an MPRIS Previous command to playPrevious, walking this frontend's own history stack", async () => {
    await usePlaybackStore.getState().playNow(trackA);
    await usePlaybackStore.getState().playNow(trackB);
    await usePlaybackStore.getState().init();

    mprisTransportHandler?.("Previous");
    await Promise.resolve();
    await Promise.resolve();

    expect(usePlaybackStore.getState().currentTrack).toEqual(trackA);
  });
});
