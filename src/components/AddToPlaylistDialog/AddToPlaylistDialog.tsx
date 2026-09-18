import { useState } from "react";
import { playlists as playlistsApi } from "../../lib/ipc";
import { usePlaylistsStore } from "../../store/playlistsStore";
import { useToast } from "../Toast/Toast";
import { Button } from "../Button/Button";
import { Dialog } from "../Dialog/Dialog";
import { Input } from "../Input/Input";
import "./AddToPlaylistDialog.css";

interface AddToPlaylistDialogProps {
  open: boolean;
  onClose: () => void;
  trackId: number | null;
}

/** Shared "add this one track to a playlist" flow — pick an existing
 * playlist or create a new one inline, without leaving the dialog. */
export function AddToPlaylistDialog({
  open,
  onClose,
  trackId,
}: AddToPlaylistDialogProps) {
  const playlists = usePlaylistsStore((s) => s.items);
  const createPlaylist = usePlaylistsStore((s) => s.create);
  const refreshPlaylists = usePlaylistsStore((s) => s.refresh);
  const { show } = useToast();
  const [newName, setNewName] = useState("");
  // Neither `addTo` nor `handleCreateAndAdd` disabled anything while
  // their own `await` was in flight, so a second Enter press or click
  // before the first IPC round-trip resolved could fire the same
  // create-or-add call twice (e.g. two identically-named playlists
  // created from one "Create & Add" double-click). Mirrors
  // MetadataEditDialog's `saving` guard.
  const [submitting, setSubmitting] = useState(false);

  // Does the actual add, with no `submitting` check of its own — callers
  // (both the "pick an existing playlist" click and `handleCreateAndAdd`
  // below) are responsible for setting `submitting` first, so this can
  // be safely called from either without a nested guard rejecting it.
  async function addToPlaylist(playlistId: number, playlistName: string) {
    if (trackId === null) return;
    await playlistsApi.addTrack(playlistId, trackId);
    // playlistsApi.addTrack is a raw IPC call, bypassing the store
    // entirely — without this, the Playlists overview's `track_count`
    // for this playlist stayed stale (off by one, too low) until some
    // unrelated action happened to trigger a refresh.
    void refreshPlaylists();
    show(`Added to ${playlistName}`, "success");
    onClose();
  }

  async function addTo(playlistId: number, playlistName: string) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await addToPlaylist(playlistId, playlistName);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateAndAdd() {
    const name = newName.trim();
    if (!name || trackId === null || submitting) return;
    setSubmitting(true);
    try {
      const id = await createPlaylist(name);
      setNewName("");
      await addToPlaylist(id, name);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add to Playlist">
      <div className="op-add-to-playlist">
        {playlists.length > 0 && (
          <ul className="op-add-to-playlist__list">
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <button
                  className="op-add-to-playlist__item"
                  disabled={submitting}
                  onClick={() => void addTo(playlist.id, playlist.name)}
                >
                  {playlist.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="op-add-to-playlist__create">
          <Input
            label="New playlist"
            placeholder="Playlist name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreateAndAdd();
            }}
            disabled={submitting}
          />
          <Button
            variant="secondary"
            disabled={submitting}
            onClick={() => void handleCreateAndAdd()}
          >
            Create &amp; Add
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
