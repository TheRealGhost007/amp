import { AddToPlaylistDialog, ConfirmDialog, MetadataEditDialog } from "../components";
import { useAddToPlaylistDialogStore } from "../store/addToPlaylistDialogStore";
import { useConfirmDialogStore } from "../store/confirmDialogStore";
import { useMetadataEditDialogStore } from "../store/metadataEditDialogStore";

/** Mounts the app's global, store-driven dialogs exactly once — every
 * track context menu (Library, Queue, playlists, Favorites, Recently
 * Played) opens these by calling the stores directly, instead of each
 * view owning its own dialog instance and open-state. */
export function GlobalDialogs() {
  const addToPlaylistTrackId = useAddToPlaylistDialogStore((s) => s.trackId);
  const closeAddToPlaylist = useAddToPlaylistDialogStore((s) => s.close);
  const confirmRequest = useConfirmDialogStore((s) => s.request);
  const closeConfirm = useConfirmDialogStore((s) => s.close);
  const metadataEditTrackId = useMetadataEditDialogStore((s) => s.trackId);
  const metadataEditOnSaved = useMetadataEditDialogStore((s) => s.onSaved);
  const closeMetadataEdit = useMetadataEditDialogStore((s) => s.close);

  return (
    <>
      <AddToPlaylistDialog
        open={addToPlaylistTrackId !== null}
        trackId={addToPlaylistTrackId}
        onClose={closeAddToPlaylist}
      />
      <MetadataEditDialog
        open={metadataEditTrackId !== null}
        trackId={metadataEditTrackId}
        onSaved={metadataEditOnSaved ?? undefined}
        onClose={closeMetadataEdit}
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
