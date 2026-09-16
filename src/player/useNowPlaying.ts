import { useMemo } from "react";
import { useLibrary } from "../context/LibraryContext";
import { type TrackListItem } from "../lib/ipc";
import { usePlaybackStore } from "../store/playbackStore";
import { useQueueStore } from "../store/queueStore";

interface NowPlaying {
  track: TrackListItem | null;
  hasNext: boolean;
  hasPrevious: boolean;
  playNext: () => void;
  playPrevious: () => void;
}

/**
 * Resolves the playback store's bare `{ id, uri }` into the full,
 * display-ready `TrackListItem` from the library listing, and exposes
 * real queue-/history-backed Previous/Next (Phase 8): Next plays and
 * dequeues the persisted queue's head; Previous steps back through the
 * in-session history stack. Neither falls back to library sort order
 * anymore — an empty queue honestly means there's nothing next, rather
 * than guessing at an unrelated track.
 */
export function useNowPlaying(): NowPlaying {
  const { tracks } = useLibrary();
  const currentTrackRef = usePlaybackStore((s) => s.currentTrack);
  const historyLength = usePlaybackStore((s) => s.history.length);
  const skipToNext = usePlaybackStore((s) => s.skipToNext);
  const playPrevious = usePlaybackStore((s) => s.playPrevious);
  const hasQueuedNext = useQueueStore((s) => s.items.length > 0);

  const track = useMemo(
    () =>
      currentTrackRef ? (tracks.find((t) => t.id === currentTrackRef.id) ?? null) : null,
    [tracks, currentTrackRef],
  );

  return {
    track,
    hasNext: hasQueuedNext,
    hasPrevious: historyLength > 0,
    playNext: () => {
      void skipToNext();
    },
    playPrevious: () => {
      void playPrevious();
    },
  };
}
