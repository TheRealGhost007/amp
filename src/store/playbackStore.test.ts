import { beforeEach, describe, expect, it, vi } from "vitest";

const playNowMock = vi.fn();
const isFavoriteMock = vi.fn();

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
  },
  favorites: {
    isFavorite: (...args: unknown[]) => isFavoriteMock(...args),
    toggle: vi.fn(),
  },
  onPlayerEvent: vi.fn().mockResolvedValue(() => {}),
  onPlayerPosition: vi.fn().mockResolvedValue(() => {}),
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
