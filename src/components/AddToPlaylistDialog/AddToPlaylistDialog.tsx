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
  const { show } = useToast();
  const [newName, setNewName] = useState("");

  async function addTo(playlistId: number, playlistName: string) {
    if (trackId === null) return;
    await playlistsApi.addTrack(playlistId, trackId);
    show(`Added to ${playlistName}`, "success");
    onClose();
  }

  async function handleCreateAndAdd() {
    const name = newName.trim();
    if (!name || trackId === null) return;
    const id = await createPlaylist(name);
    setNewName("");
    await addTo(id, name);
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
          />
          <Button variant="secondary" onClick={() => void handleCreateAndAdd()}>
            Create &amp; Add
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
