import { useMemo } from "react";
import { Artwork, EmptyState, Icon, MediaRow } from "../components";
import { useLibrary } from "../context/LibraryContext";
import { buildTrackMenuItems } from "../lib/trackMenu";
import { formatDuration } from "../lib/format";
import { playListStartingAt } from "../lib/playFromList";
import { useFavoritesStore } from "../store/favoritesStore";
import { useNavigationStore } from "../store/navigationStore";
import { usePlaybackStore } from "../store/playbackStore";
import "./views.css";
import "./PlaylistDetail.css";
import "./AlbumDetail.css";

export function AlbumDetail({ albumId }: { albumId: number }) {
  const { tracks, albums, refresh } = useLibrary();
  const backFromAlbum = useNavigationStore((s) => s.backFromAlbum);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const currentTrackId = usePlaybackStore((s) => s.currentTrack?.id);

  const album = albums.find((a) => a.id === albumId);
  const albumTracks = useMemo(
    () =>
      tracks
        .filter((t) => t.album_id === albumId)
        // Disc number first, then track number — sorting by track_number
        // alone would interleave a multi-disc album's tracks (e.g. disc 2
        // track 1 sorting before disc 1 track 5, since both would compare
        // as "track 1" vs "track 5" with no disc to break the tie).
        .sort(
          (a, b) =>
            (a.disc_number ?? 0) - (b.disc_number ?? 0) ||
            (a.track_number ?? 0) - (b.track_number ?? 0),
        ),
    [tracks, albumId],
  );

  if (!album) {
    return (
      <div className="op-view">
        <button className="op-playlist-detail__back" onClick={backFromAlbum}>
          <Icon name="chevron-left" size={16} />
          All Albums
        </button>
        <EmptyState
          icon="disc"
          title="Album not found"
          description="This album no longer has any tracks in your library."
        />
      </div>
    );
  }

  return (
    <div className="op-view">
      <button className="op-playlist-detail__back" onClick={backFromAlbum}>
        <Icon name="chevron-left" size={16} />
        All Albums
      </button>

      <div className="op-album-detail__header">
        <Artwork
          seed={`${album.artist_name ?? "Unknown Artist"} — ${album.title}`}
          alt=""
          size={120}
        />
        <div>
          <h1 className="op-view__title">{album.title}</h1>
          <p className="op-view__subtitle">
            {album.artist_name ?? "Unknown Artist"}
            {album.year ? ` · ${album.year}` : ""} · {album.track_count} song
            {album.track_count === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="op-playlist-detail__list">
        {albumTracks.map((track, index) => (
          <MediaRow
            key={track.id}
            artworkSeed={`${track.artist_name ?? "Unknown Artist"} — ${track.album_title ?? track.title}`}
            title={track.title}
            subtitle={
              track.track_number
                ? `${track.track_number}. ${track.artist_name ?? ""}`
                : (track.artist_name ?? "")
            }
            trailing={formatDuration(track.duration_ms)}
            active={track.id === currentTrackId}
            favorite={favoriteIds.has(track.id)}
            onToggleFavorite={() => void toggleFavorite(track.id)}
            onClick={() => void playListStartingAt(albumTracks, index)}
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
