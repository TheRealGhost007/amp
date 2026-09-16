import { useEffect, useState } from "react";
import { EmptyState, MediaRow } from "../components";
import { history, pathToFileUri, type TrackListItem } from "../lib/ipc";
import { buildTrackMenuItems } from "../lib/trackMenu";
import { formatDuration } from "../lib/format";
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
  const playNow = usePlaybackStore((s) => s.playNow);
  const currentTrackId = usePlaybackStore((s) => s.currentTrack?.id);
  const refreshLibrary = useLibrary().refresh;

  function refreshRecent() {
    history.listRecent().then(setTracks);
  }

  useEffect(() => {
    let cancelled = false;
    history.listRecent().then((items) => {
      if (!cancelled) setTracks(items);
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

  return (
    <div className="op-view">
      <ViewHeader
        title="Recently Played"
        subtitle={tracks === null ? "Loading…" : undefined}
      />
      <div className="op-recently-played__list">
        {(tracks ?? []).map((track) => (
          <MediaRow
            key={track.id}
            artworkSeed={`${track.artist_name ?? "Unknown Artist"} — ${track.album_title ?? track.title}`}
            title={track.title}
            subtitle={track.artist_name ?? "Unknown Artist"}
            trailing={formatDuration(track.duration_ms)}
            active={track.id === currentTrackId}
            favorite={favoriteIds.has(track.id)}
            onToggleFavorite={() => void toggleFavorite(track.id)}
            onClick={() => void playNow({ id: track.id, uri: pathToFileUri(track.path) })}
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
