import { useMemo } from "react";
import { EmptyState, Icon, MediaRow } from "../components";
import { useLibrary } from "../context/LibraryContext";
import { pathToFileUri } from "../lib/ipc";
import { buildTrackMenuItems } from "../lib/trackMenu";
import { formatDuration } from "../lib/format";
import { useFavoritesStore } from "../store/favoritesStore";
import { useNavigationStore } from "../store/navigationStore";
import { usePlaybackStore } from "../store/playbackStore";
import "./views.css";
import "./PlaylistDetail.css";

export function ArtistDetail({ artistId }: { artistId: number }) {
  const { tracks, artists, refresh } = useLibrary();
  const backFromArtist = useNavigationStore((s) => s.backFromArtist);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const playNow = usePlaybackStore((s) => s.playNow);
  const currentTrackId = usePlaybackStore((s) => s.currentTrack?.id);

  const artist = artists.find((a) => a.id === artistId);
  const artistTracks = useMemo(
    () => tracks.filter((t) => t.artist_id === artistId),
    [tracks, artistId],
  );

  if (!artist) {
    // The artist's last track was removed from the library while this
    // screen was open (or it was opened with a stale id) — nothing left
    // to show here.
    return (
      <div className="op-view">
        <button className="op-playlist-detail__back" onClick={backFromArtist}>
          <Icon name="chevron-left" size={16} />
          All Artists
        </button>
        <EmptyState
          icon="user"
          title="Artist not found"
          description="This artist no longer has any tracks in your library."
        />
      </div>
    );
  }

  return (
    <div className="op-view">
      <button className="op-playlist-detail__back" onClick={backFromArtist}>
        <Icon name="chevron-left" size={16} />
        All Artists
      </button>

      <div className="op-playlist-detail__header">
        <div>
          <h1 className="op-view__title">{artist.name}</h1>
          <p className="op-view__subtitle">
            {artist.album_count} album{artist.album_count === 1 ? "" : "s"} ·{" "}
            {artist.track_count} song{artist.track_count === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="op-playlist-detail__list">
        {artistTracks.map((track) => (
          <MediaRow
            key={track.id}
            artworkSeed={`${track.artist_name ?? "Unknown Artist"} — ${track.album_title ?? track.title}`}
            title={track.title}
            subtitle={track.album_title ?? "Unknown Album"}
            trailing={formatDuration(track.duration_ms)}
            active={track.id === currentTrackId}
            favorite={favoriteIds.has(track.id)}
            onToggleFavorite={() => void toggleFavorite(track.id)}
            onClick={() => void playNow({ id: track.id, uri: pathToFileUri(track.path) })}
            actions={buildTrackMenuItems(track, {
              onRemovedFromLibrary: () => void refresh(),
              onMetadataUpdated: () => void refresh(),
            })}
          />
        ))}
      </div>
    </div>
  );
}
