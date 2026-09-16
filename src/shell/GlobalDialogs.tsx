import { AddToPlaylistDialog, ConfirmDialog } from "../components";
import { useAddToPlaylistDialogStore } from "../store/addToPlaylistDialogStore";
import { useConfirmDialogStore } from "../store/confirmDialogStore";

/** Mounts the app's two global, store-driven dialogs exactly once —
 * every track context menu (Library, Queue, playlists, Favorites,
 * Recently Played) opens these by calling the stores directly, instead
 * of each view owning its own dialog instance and open-state. */
export function GlobalDialogs() {
  const addToPlaylistTrackId = useAddToPlaylistDialogStore((s) => s.trackId);
  const closeAddToPlaylist = useAddToPlaylistDialogStore((s) => s.close);
  const confirmRequest = useConfirmDialogStore((s) => s.request);
  const closeConfirm = useConfirmDialogStore((s) => s.close);

  return (
    <>
      <AddToPlaylistDialog
        open={addToPlaylistTrackId !== null}
        trackId={addToPlaylistTrackId}
        onClose={closeAddToPlaylist}
      />
      <ConfirmDialog
        open={confirmRequest !== null}
        title={confirmRequest?.title ?? ""}
        description={confirmRequest?.description ?? ""}
        confirmLabel={confirmRequest?.confirmLabel}
        danger={confirmRequest?.danger}
        onConfirm={() => confirmRequest?.onConfirm()}
        onClose={closeConfirm}
      />
    </>
  );
}
