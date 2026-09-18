import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, EmptyState, MediaRow } from "../components";
import { useLibrary } from "../context/LibraryContext";
import { history, type TrackListItem } from "../lib/ipc";
import { buildTrackMenuItems } from "../lib/trackMenu";
import { formatDuration } from "../lib/format";
import { playListStartingAt } from "../lib/playFromList";
import { useFavoritesStore } from "../store/favoritesStore";
import { useNavigationStore } from "../store/navigationStore";
import { usePlaybackStore } from "../store/playbackStore";
import { ViewHeader } from "./ViewHeader";
import "./views.css";
import "./Home.css";

const SECTION_LIMIT = 5;

/** Home (spec §5's "dashboard" ask): recently played + favorites, each a
 * real backend-wired preview linking through to its own full view. This
 * was a hardcoded EmptyState stub since Phase 5 — the plan always called
 * for real data "where later phases fill it in," and Favorites/Recently
 * Played did get built with real data in Phase 9, but nothing ever came
 * back to wire Home up to it. */
export function Home() {
  const { tracks, loading: libraryLoading, refresh } = useLibrary();
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const currentTrackId = usePlaybackStore((s) => s.currentTrack?.id);
  const navigate = useNavigationStore((s) => s.navigate);

  const [recentTracks, setRecentTracks] = useState<TrackListItem[] | null>(null);
  const seqRef = useRef(0);

  const refreshRecent = useCallback(() => {
    const seq = ++seqRef.current;
    history.listRecent().then((items) => {
      if (seq === seqRef.current) setRecentTracks(items);
    });
  }, []);

  useEffect(() => {
    const seq = ++seqRef.current;
    let cancelled = false;
    history.listRecent().then((items) => {
      if (!cancelled && seq === seqRef.current) setRecentTracks(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const favoriteTracks = useMemo(
    () => tracks.filter((track) => favoriteIds.has(track.id)),
    [tracks, favoriteIds],
  );

  const recent = (recentTracks ?? []).slice(0, SECTION_LIMIT);
  const favorites = favoriteTracks.slice(0, SECTION_LIMIT);

  if (!libraryLoading && tracks.length === 0) {
    return (
      <div className="op-view">
        <ViewHeader title="Home" />
        <EmptyState
          icon="home"
          title="Nothing to play yet"
          description="Add a music folder to your library and your recently played tracks, favorites, and recommendations will show up here."
        />
      </div>
    );
  }

  return (
    <div className="op-view">
      <ViewHeader title="Home" />

      <section className="op-home-section">
        <div className="op-home-section__header">
          <h2 className="op-home-section__title">Recently Played</h2>
          {recent.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => navigate("recently-played")}>
              See all
            </Button>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="op-settings-section__note">
            Tracks you play will show up here, most recent first.
          </p>
        ) : (
          <div className="op-home-section__list">
            {/* eslint-disable-next-line react-hooks/refs -- false positive,
                same as RecentlyPlayed.tsx's identical pattern: `refreshRecent`
                only reads `seqRef.current` inside its own call body (triggered
                from a menu action) and inside a `.then()` continuation, never
                synchronously during render. */}
            {recent.map((track, index) => (
              <MediaRow
                key={track.id}
                artworkSeed={`${track.artist_name ?? "Unknown Artist"} — ${track.album_title ?? track.title}`}
                title={track.title}
                subtitle={track.artist_name ?? "Unknown Artist"}
                trailing={formatDuration(track.duration_ms)}
                active={track.id === currentTrackId}
                favorite={favoriteIds.has(track.id)}
                onToggleFavorite={() => void toggleFavorite(track.id)}
                onClick={() => void playListStartingAt(recent, index)}
                actions={buildTrackMenuItems(track, {
                  onRemovedFromLibrary: () => {
                    void refresh();
                    refreshRecent();
                  },
                  onMetadataUpdated: () => {
                    void refresh();
                    refreshRecent();
                  },
                })}
              />
            ))}
          </div>
        )}
      </section>

      <section className="op-home-section">
        <div className="op-home-section__header">
          <h2 className="op-home-section__title">Favorites</h2>
          {favorites.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => navigate("favorites")}>
              See all
            </Button>
          )}
        </div>
        {favorites.length === 0 ? (
          <p className="op-settings-section__note">
            Favorite a track and it&rsquo;ll show up here.
          </p>
        ) : (
          <div className="op-home-section__list">
            {favorites.map((track, index) => (
              <MediaRow
                key={track.id}
                artworkSeed={`${track.artist_name ?? "Unknown Artist"} — ${track.album_title ?? track.title}`}
                title={track.title}
                subtitle={track.artist_name ?? "Unknown Artist"}
                trailing={formatDuration(track.duration_ms)}
                active={track.id === currentTrackId}
                favorite
                onToggleFavorite={() => void toggleFavorite(track.id)}
                onClick={() => void playListStartingAt(favorites, index)}
                actions={buildTrackMenuItems(track, {
                  onRemovedFromLibrary: () => void refresh(),
                  onMetadataUpdated: () => void refresh(),
                })}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
