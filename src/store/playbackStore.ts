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
    try {
      const status = await player.status();
      set({
        currentTrack: status.current_track,
        isPlaying: status.is_playing,
        positionMs: status.position_ms ?? 0,
        durationMs: status.duration_ms,
        isFavorite: await fetchFavoriteStatus(status.current_track),
      });
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
          const status = await player.status();
          set({
            currentTrack: status.current_track,
            isFavorite: await fetchFavoriteStatus(status.current_track),
          });
          break;
        }
        case "PlaybackFinished":
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
    await player.playNow(track);
    set({ currentTrack: track, isPlaying: true, error: null });
    set({ isFavorite: await fetchFavoriteStatus(track) });
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
    const isFavorite = await favorites.toggle(currentTrack.id);
    set({ isFavorite });
  },
}));
