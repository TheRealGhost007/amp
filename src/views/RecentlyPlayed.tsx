import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, MediaRow } from "../components";
import { history, type TrackListItem } from "../lib/ipc";
import { buildTrackMenuItems } from "../lib/trackMenu";
import { formatDuration } from "../lib/format";
import { playListStartingAt } from "../lib/playFromList";
import { useLibrary } from "../context/LibraryContext";
import { useFavoritesStore } from "../store/favoritesStore";
import { usePlaybackStore } from "../store/playbackStore";
import { ViewHeader } from "./ViewHeader";
import "./views.css";
import "./Library.css";
import "./RecentlyPlayed.css";

export function RecentlyPlayed() {
  const [tracks, setTracks] = useState<TrackListItem[] | null>(null);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const currentTrackId = usePlaybackStore((s) => s.currentTrack?.id);
  const refreshLibrary = useLibrary().refresh;

  // Tauri dispatches commands across a thread pool with no ordering
  // guarantee, so two overlapping `listRecent` calls (e.g. removing two
  // tracks from the library in quick succession, each triggering its
  // own refresh) can resolve out of order — same shape of race already
  // fixed once in LibraryContext's `seqRef`.
  const seqRef = useRef(0);

  const refreshRecent = useCallback(() => {
    const seq = ++seqRef.current;
    history.listRecent().then((items) => {
      if (seq === seqRef.current) setTracks(items);
    });
  }, []);

  useEffect(() => {
    const seq = ++seqRef.current;
    let cancelled = false;
    history.listRecent().then((items) => {
      if (!cancelled && seq === seqRef.current) setTracks(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (tracks !== null && tracks.length === 0) {
    return (
      <div className="op-view">
        <ViewHeader title="Recently Played" />
        <EmptyState
          icon="clock"
          title="Nothing played yet"
          description="Tracks you play will show up here, most recent first."
        />
      </div>
    );
  }

  const displayedTracks = tracks ?? [];

  return (
    <div className="op-view">
      <ViewHeader
        title="Recently Played"
        subtitle={tracks === null ? "Loading…" : undefined}
      />
      <div className="op-recently-played__list">
        {/* eslint-disable-next-line react-hooks/refs -- false positive:
            `refreshRecent` only reads `seqRef.current` inside its own
            call body (triggered from a click handler) and inside a
            `.then()` continuation, never synchronously during render.
            Same useCallback+useRef seq-guard shape as PlaylistDetail.tsx
            and LibraryContext.tsx, neither of which trip this rule;
            PlaylistDetail.tsx's dnd-kit hooks appear to make the
            compiler skip deep analysis of that component entirely
            (visible separately as Library.tsx's own accepted
            "Compilation Skipped: incompatible library" warning for
            useVirtualizer), which this component has no equivalent
            bailout for. Verified by bisection, not just assumed. */}
        {displayedTracks.map((track, index) => (
          <MediaRow
            key={track.id}
            artworkSeed={`${track.artist_name ?? "Unknown Artist"} — ${track.album_title ?? track.title}`}
            title={track.title}
            subtitle={track.artist_name ?? "Unknown Artist"}
            trailing={formatDuration(track.duration_ms)}
            active={track.id === currentTrackId}
            favorite={favoriteIds.has(track.id)}
            onToggleFavorite={() => void toggleFavorite(track.id)}
            onClick={() => void playListStartingAt(displayedTracks, index)}
            actions={buildTrackMenuItems(track, {
              onRemovedFromLibrary: () => {
                void refreshLibrary();
                refreshRecent();
              },
              onMetadataUpdated: () => {
                void refreshLibrary();
                refreshRecent();
              },
            })}
          />
        ))}
      </div>
    </div>
  );
}
