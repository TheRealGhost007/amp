import { create } from "zustand";
import {
  favorites,
  history,
  onPlayerEvent,
  onPlayerPosition,
  pathToFileUri,
  player,
  type TrackRef,
} from "../lib/ipc";
import { useQueueStore } from "./queueStore";

/** How many previously-played tracks `playPrevious` can step back
 * through — an in-memory-only convenience stack (not persisted, unlike
 * the queue), so it resets on restart like most players' back button. */
const HISTORY_LIMIT = 50;

interface PlaybackStore {
  currentTrack: TrackRef | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number | null;
  volume: number;
  muted: boolean;
  isFavorite: boolean;
  /** Tracks played before the current one, most recent first — what
   * `playPrevious` steps back through. Rewinding through it never
   * touches the persisted queue; the queue only ever moves forward. */
  history: TrackRef[];
  /** Human-readable message from the last backend error event, if any —
   * cleared on the next successful state change. */
  error: string | null;
  /** `false` until the audio backend fails to initialize on the Rust
   * side (spec §27: the app still runs, transport controls just report
   * this instead of silently doing nothing). */
  audioUnavailable: boolean;

  init: () => Promise<() => void>;
  playNow: (track: TrackRef) => Promise<void>;
  /** Advances to and plays the persisted queue's head immediately (a
   * manual, hard-cut skip) — distinct from the backend's own gapless/
   * crossfade advance, which `TrackAdvanced` already handles. */
  skipToNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  setMuted: (muted: boolean) => Promise<void>;
  toggleFavorite: () => Promise<void>;
}

function isAudioUnavailable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "AUDIO_UNAVAILABLE"
  );
}

async function fetchFavoriteStatus(track: TrackRef | null): Promise<boolean> {
  if (!track) return false;
  try {
    return await favorites.isFavorite(track.id);
  } catch {
    return false;
  }
}

/** Tauri dispatches non-async commands across a thread pool, so two
 * concurrent invocations (e.g. a user double-clicking Next before the
 * first click's command has replied) are not guaranteed to resolve in
 * call order. Every write to `currentTrack`/`isFavorite` that follows an
 * `await` captures the current sequence number first and re-checks it
 * before writing, so a slower, now-superseded call can never clobber a
 * faster, newer one — only the most-recently-*initiated* call's result
 * is ever allowed to stick, regardless of resolution order. */
let trackMutationSeq = 0;
let favoriteSeq = 0;

export const usePlaybackStore = create<PlaybackStore>((set, get) => {
  /** Shared body for `playNow`/`playPrevious`: applies the sequence-
   * guarded track/favorite update, then re-arms the backend's `next`
   * from the (unconsumed) queue, since `player.playNow` clears it as a
   * side effect of jumping straight to a track. `pushCurrentToHistory`
   * is false for `playPrevious` — stepping backward must not re-push the
   * track being left, or repeated Previous presses would oscillate
   * between two tracks instead of walking further back. */
  async function playTrack(track: TrackRef, pushCurrentToHistory: boolean) {
    const trackSeq = ++trackMutationSeq;
    const previousTrack = get().currentTrack;
    await player.playNow(track);
    if (trackSeq !== trackMutationSeq) return;
    set((state) => ({
      currentTrack: track,
      isPlaying: true,
      error: null,
      history:
        pushCurrentToHistory && previousTrack
          ? [previousTrack, ...state.history].slice(0, HISTORY_LIMIT)
          : state.history,
    }));
    void useQueueStore.getState().syncNext();
    // Best-effort: a failed history write should never block playback
    // itself, so it's neither awaited nor allowed to throw.
    history.recordPlayed(track.id).catch(() => {});
    const favSeq = ++favoriteSeq;
    const isFavorite = await fetchFavoriteStatus(track);
    if (favSeq === favoriteSeq) set({ isFavorite });
  }

  return {
    currentTrack: null,
    isPlaying: false,
    positionMs: 0,
    durationMs: null,
    volume: 1,
    muted: false,
    isFavorite: false,
    history: [],
    error: null,
    audioUnavailable: false,

    init: async () => {
      const trackSeq = ++trackMutationSeq;
      try {
        const status = await player.status();
        if (trackSeq !== trackMutationSeq) {
          // A playNow already landed while this initial fetch was in
          // flight — that newer state must win, not this stale snapshot.
        } else {
          const favSeq = ++favoriteSeq;
          const isFavorite = await fetchFavoriteStatus(status.current_track);
          set({
            currentTrack: status.current_track,
            isPlaying: status.is_playing,
            positionMs: status.position_ms ?? 0,
            durationMs: status.duration_ms,
            ...(favSeq === favoriteSeq ? { isFavorite } : null),
          });
        }
      } catch (error) {
        if (isAudioUnavailable(error)) set({ audioUnavailable: true });
      }

      const unlistenPosition = await onPlayerPosition((position) => {
        set({
          positionMs: position.position_ms ?? 0,
          durationMs: position.duration_ms,
        });
      });

      const unlistenEvent = await onPlayerEvent(async (event) => {
        switch (event.type) {
          case "StateChanged":
            set({ isPlaying: event.data === "Playing" });
            break;
          case "TrackAdvanced": {
            const trackSeq = ++trackMutationSeq;
            const previousTrack = get().currentTrack;
            const status = await player.status();
            if (trackSeq !== trackMutationSeq) break;
            const favSeq = ++favoriteSeq;
            const isFavorite = await fetchFavoriteStatus(status.current_track);
            set((state) => ({
              currentTrack: status.current_track,
              history: previousTrack
                ? [previousTrack, ...state.history].slice(0, HISTORY_LIMIT)
                : state.history,
              ...(favSeq === favoriteSeq ? { isFavorite } : null),
            }));
            // The backend just consumed the queue head it was preloaded
            // with as `next` (see queueStore's doc comment) — remove it
            // from the persisted queue and arm the new head.
            void useQueueStore.getState().consumeHead();
            if (status.current_track) {
              history.recordPlayed(status.current_track.id).catch(() => {});
            }
            break;
          }
          case "PlaybackFinished":
            trackMutationSeq++;
            favoriteSeq++;
            set({
              currentTrack: null,
              isPlaying: false,
              positionMs: 0,
              isFavorite: false,
            });
            break;
          case "Error":
            set({ error: event.data });
            break;
          case "OutputDevicesChanged":
            break;
        }
      });

      return () => {
        unlistenPosition();
        unlistenEvent();
      };
    },

    playNow: (track) => playTrack(track, true),

    skipToNext: async () => {
      const head = useQueueStore.getState().items[0];
      if (!head) return;
      // Consume it from the persisted queue first (same as a natural
      // TrackAdvanced would) so the immediate playTrack below re-arms the
      // backend's `next` from what's *now* the head, not the track we're
      // about to jump to.
      await useQueueStore.getState().consumeHead();
      await playTrack({ id: head.track.id, uri: pathToFileUri(head.track.path) }, true);
    },

    playPrevious: async () => {
      const [previous, ...rest] = get().history;
      if (!previous) return;
      set({ history: rest });
      await playTrack(previous, false);
    },

    togglePlayPause: async () => {
      const { isPlaying } = get();
      if (isPlaying) {
        await player.pause();
        set({ isPlaying: false });
      } else {
        await player.resume();
        set({ isPlaying: true });
      }
    },

    seek: async (positionMs) => {
      await player.seek(positionMs);
      set({ positionMs });
    },

    setVolume: async (volume) => {
      await player.setVolume(volume);
      set({ volume });
    },

    setMuted: async (muted) => {
      await player.setMuted(muted);
      set({ muted });
    },

    toggleFavorite: async () => {
      const { currentTrack } = get();
      if (!currentTrack) return;
      const favSeq = ++favoriteSeq;
      const isFavorite = await favorites.toggle(currentTrack.id);
      if (favSeq === favoriteSeq) set({ isFavorite });
    },
  };
});
