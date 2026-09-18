import { usePlaybackStore } from "../store/playbackStore";
import { useQueueStore } from "../store/queueStore";
import { pathToFileUri, type TrackListItem } from "./ipc";

/** Plays `tracks[startIndex]` and replaces the queue with every track
 * that follows it in the same list — the standard "click a song in a
 * list" behavior every mainstream music player has: the rest of the
 * list keeps playing once the clicked track finishes, instead of
 * stopping dead after one song. Used by every track-listing view
 * (Library, Album/Artist detail, Playlist detail, Favorites, Recently
 * Played) so clicking a track behaves the same way everywhere. */
export async function playListStartingAt(
  tracks: TrackListItem[],
  startIndex: number,
): Promise<void> {
  const track = tracks[startIndex];
  if (!track) return;
  const rest = tracks.slice(startIndex + 1);
  await usePlaybackStore
    .getState()
    .playNow({ id: track.id, uri: pathToFileUri(track.path) });
  await useQueueStore.getState().replaceWith(rest.map((t) => t.id));
}
