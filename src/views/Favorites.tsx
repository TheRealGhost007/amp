import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EmptyState, MediaRow } from "../components";
import { useLibrary } from "../context/LibraryContext";
import { buildTrackMenuItems } from "../lib/trackMenu";
import { formatDuration } from "../lib/format";
import { playListStartingAt } from "../lib/playFromList";
import { useFavoritesStore } from "../store/favoritesStore";
import { usePlaybackStore } from "../store/playbackStore";
import { ViewHeader } from "./ViewHeader";
import "./views.css";
import "./Library.css";

const ROW_HEIGHT = 56;

export function Favorites() {
  const { tracks, loading, refresh } = useLibrary();
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const favoritesLoading = useFavoritesStore((s) => s.loading);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const currentTrackId = usePlaybackStore((s) => s.currentTrack?.id);

  const favoriteTracks = useMemo(
    () => tracks.filter((track) => favoriteIds.has(track.id)),
    [tracks, favoriteIds],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: favoriteTracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  if (!loading && !favoritesLoading && favoriteTracks.length === 0) {
    return (
      <div className="op-view">
        <ViewHeader title="Favorites" />
        <EmptyState
          icon="heart"
          title="No favorites yet"
          description="Favorite a track and it'll show up here."
        />
      </div>
    );
  }

  return (
    <div className="op-view op-view--flush">
      <ViewHeader
        title="Favorites"
        subtitle={
          loading || favoritesLoading
            ? "Loading…"
            : `${favoriteTracks.length} song${favoriteTracks.length === 1 ? "" : "s"}`
        }
      />
      <div className="op-library__list" ref={scrollRef}>
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const track = favoriteTracks[virtualRow.index];
            return (
              <div
                key={track.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <MediaRow
                  artworkSeed={`${track.artist_name ?? "Unknown Artist"} — ${track.album_title ?? track.title}`}
                  title={track.title}
                  subtitle={track.artist_name ?? "Unknown Artist"}
                  trailing={formatDuration(track.duration_ms)}
                  active={track.id === currentTrackId}
                  favorite
                  onToggleFavorite={() => void toggleFavorite(track.id)}
                  onClick={() =>
                    void playListStartingAt(favoriteTracks, virtualRow.index)
                  }
                  actions={buildTrackMenuItems(track, {
                    onRemovedFromLibrary: () => void refresh(),
                    onMetadataUpdated: () => void refresh(),
                  })}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
