import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { MenuItemSpec } from "../components";
import { useAddToPlaylistDialogStore } from "../store/addToPlaylistDialogStore";
import { useConfirmDialogStore } from "../store/confirmDialogStore";
import { useFavoritesStore } from "../store/favoritesStore";
import { useMetadataEditDialogStore } from "../store/metadataEditDialogStore";
import { useNavigationStore } from "../store/navigationStore";
import { usePlaybackStore } from "../store/playbackStore";
import { useQueueStore } from "../store/queueStore";
import { library, pathToFileUri, type TrackListItem } from "./ipc";

export interface TrackMenuOptions {
  /** Prepended before the shared items — e.g. "Remove from Queue" in
   * Queue, "Remove from Playlist" in playlist detail. Each view owns
   * the action that's specific to its own list. */
  extraItems?: MenuItemSpec[];
  /** Called after the track is actually removed from the library, so
   * the calling view's own visible list drops it immediately — each
   * view is responsible for refreshing whatever it displays (its own
   * `LibraryContext`/`queueStore`/local track list); this menu builder
   * has no single global cache it could refresh on every view's behalf. */
  onRemovedFromLibrary?: () => void;
  /** Called after the metadata editor saves changes to this track, so
   * the calling view's own visible list picks up the new title/artist/
   * album/etc. immediately — same reasoning as `onRemovedFromLibrary`. */
  onMetadataUpdated?: () => void;
}

/** Spec §15: one shared context-menu builder for every song row in the
 * app (Library, Queue, playlist detail, Favorites, Recently Played),
 * rather than bespoke per-view menus. Not a hook — called per-row inside
 * a `.map()`, so it reads store state via `getState()` rather than
 * subscribing (each row still re-renders when its own props change,
 * e.g. `isFavorite`, since the caller passes fresh `track` data on every
 * render; only the *menu's* one-time-per-open construction is a plain
 * function call). */
export function buildTrackMenuItems(
  track: TrackListItem,
  options: TrackMenuOptions = {},
): MenuItemSpec[] {
  const isFavorite = useFavoritesStore.getState().ids.has(track.id);
  const trackRef = { id: track.id, uri: pathToFileUri(track.path) };

  const items: MenuItemSpec[] = [...(options.extraItems ?? [])];

  function pushSection(section: MenuItemSpec[]) {
    if (section.length === 0) return;
    const [first, ...rest] = section;
    items.push({ ...first, separatorBefore: items.length > 0 }, ...rest);
  }

  pushSection([
    {
      id: "play",
      label: "Play",
      icon: "play",
      onSelect: () => void usePlaybackStore.getState().playNow(trackRef),
    },
    {
      id: "play-next",
      label: "Play Next",
      onSelect: () => void useQueueStore.getState().playNext(track.id),
    },
    {
      id: "add-to-queue",
      label: "Add to Queue",
      onSelect: () => void useQueueStore.getState().addToQueue(track.id),
    },
  ]);

  pushSection([
    {
      id: "add-to-playlist",
      label: "Add to Playlist…",
      onSelect: () => useAddToPlaylistDialogStore.getState().open(track.id),
    },
    {
      id: "favorite",
      label: isFavorite ? "Remove from Favorites" : "Add to Favorites",
      icon: isFavorite ? "heart-filled" : "heart",
      onSelect: () => void useFavoritesStore.getState().toggle(track.id),
    },
  ]);

  const navItems: MenuItemSpec[] = [];
  if (track.artist_id !== null) {
    const artistId = track.artist_id;
    navItems.push({
      id: "view-artist",
      label: "View Artist",
      onSelect: () => useNavigationStore.getState().viewArtist(artistId),
    });
  }
  if (track.album_id !== null) {
    const albumId = track.album_id;
    navItems.push({
      id: "view-album",
      label: "View Album",
      onSelect: () => useNavigationStore.getState().viewAlbum(albumId),
    });
  }
  pushSection(navItems);

  pushSection([
    {
      id: "copy-info",
      label: "Copy Info",
      onSelect: () => {
        const parts = [track.title, track.artist_name, track.album_title].filter(
          (part): part is string => Boolean(part),
        );
        void navigator.clipboard.writeText(parts.join(" — "));
      },
    },
    {
      id: "open-file-location",
      label: "Open File Location",
      onSelect: () => void revealItemInDir(track.path),
    },
    {
      id: "edit-metadata",
      label: "Edit Metadata…",
      onSelect: () =>
        useMetadataEditDialogStore.getState().open(track.id, options.onMetadataUpdated),
    },
  ]);

  pushSection([
    {
      id: "remove-from-library",
      label: "Remove From Library",
      danger: true,
      onSelect: () => {
        useConfirmDialogStore.getState().confirm({
          title: "Remove From Library",
          description: `"${track.title}" will be removed from your library. The file on disk is not deleted.`,
          confirmLabel: "Remove",
          onConfirm: () => {
            void library
              .removeTrack(track.id)
              .then(() => options.onRemovedFromLibrary?.());
          },
        });
      },
    },
  ]);

  return items;
}
