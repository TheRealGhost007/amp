import { useMemo } from "react";
import { useLibrary } from "../context/LibraryContext";
import { pathToFileUri, type TrackListItem } from "../lib/ipc";
import { usePlaybackStore } from "../store/playbackStore";

interface NowPlaying {
  track: TrackListItem | null;
  hasNext: boolean;
  hasPrevious: boolean;
  playNext: () => void;
  playPrevious: () => void;
}

/**
 * Resolves the playback store's bare `{ id, uri }` into the full,
 * display-ready `TrackListItem` from the library listing, and derives
 * next/previous from that same sorted list.
 *
 * There's no real queue yet (that's Phase 8) — falling back to "next/
 * previous track in the current library sort order" is a real, honest
 * behavior in the meantime rather than a non-functional placeholder
 * button; once Phase 8 lands a real queue it takes precedence here.
 */
export function useNowPlaying(): NowPlaying {
  const { tracks } = useLibrary();
  const currentTrackRef = usePlaybackStore((s) => s.currentTrack);
  const playNow = usePlaybackStore((s) => s.playNow);

  const index = useMemo(
    () => (currentTrackRef ? tracks.findIndex((t) => t.id === currentTrackRef.id) : -1),
    [tracks, currentTrackRef],
  );

  const track = index >= 0 ? tracks[index] : null;
  const nextTrack = index >= 0 ? (tracks[index + 1] ?? null) : null;
  const previousTrack = index >= 0 ? (tracks[index - 1] ?? null) : null;

  return {
    track,
    hasNext: nextTrack !== null,
    hasPrevious: previousTrack !== null,
    playNext: () => {
      if (nextTrack) playNow({ id: nextTrack.id, uri: pathToFileUri(nextTrack.path) });
    },
    playPrevious: () => {
      if (previousTrack)
        playNow({ id: previousTrack.id, uri: pathToFileUri(previousTrack.path) });
    },
  };
}
