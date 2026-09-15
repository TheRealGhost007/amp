import { create } from "zustand";
import {
  favorites,
  onPlayerEvent,
  onPlayerPosition,
  player,
  type TrackRef,
} from "../lib/ipc";

interface PlaybackStore {
  currentTrack: TrackRef | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number | null;
  volume: number;
  muted: boolean;
  isFavorite: boolean;
  /** Human-readable message from the last backend error event, if any —
   * cleared on the next successful state change. */
  error: string | null;
  /** `false` until the audio backend fails to initialize on the Rust
   * side (spec §27: the app still runs, transport controls just report
   * this instead of silently doing nothing). */
  audioUnavailable: boolean;

  init: () => Promise<() => void>;
  playNow: (track: TrackRef) => Promise<void>;
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

export const usePlaybackStore = create<PlaybackStore>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  positionMs: 0,
  durationMs: null,
  volume: 1,
  muted: false,
  isFavorite: false,
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
          const status = await player.status();
          if (trackSeq !== trackMutationSeq) break;
          const favSeq = ++favoriteSeq;
          const isFavorite = await fetchFavoriteStatus(status.current_track);
          set({
            currentTrack: status.current_track,
            ...(favSeq === favoriteSeq ? { isFavorite } : null),
          });
          break;
        }
        case "PlaybackFinished":
          trackMutationSeq++;
          favoriteSeq++;
          set({ currentTrack: null, isPlaying: false, positionMs: 0, isFavorite: false });
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

  playNow: async (track) => {
    const trackSeq = ++trackMutationSeq;
    await player.playNow(track);
    if (trackSeq !== trackMutationSeq) return;
    set({ currentTrack: track, isPlaying: true, error: null });
    const favSeq = ++favoriteSeq;
    const isFavorite = await fetchFavoriteStatus(track);
    if (favSeq === favoriteSeq) set({ isFavorite });
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
}));
