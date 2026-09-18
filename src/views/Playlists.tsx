import { useCallback, useState } from "react";
import { Button, Dialog, EmptyState, Input, MediaRow } from "../components";
import { useConfirmDialogStore } from "../store/confirmDialogStore";
import { useNavigationStore } from "../store/navigationStore";
import { usePlaylistsStore } from "../store/playlistsStore";
import { PlaylistDetail } from "./PlaylistDetail";
import { ViewHeader } from "./ViewHeader";
import "./views.css";
import "./Playlists.css";

export function Playlists() {
  const playlists = usePlaylistsStore((s) => s.items);
  const loading = usePlaylistsStore((s) => s.loading);
  const create = usePlaylistsStore((s) => s.create);
  const remove = usePlaylistsStore((s) => s.remove);
  const confirm = useConfirmDialogStore((s) => s.confirm);
  // Lifted to navigationStore (not view-local) so the command palette's
  // playlist search results and any future entry point can jump straight
  // to a specific playlist instead of only ever landing on this list.
  const selectedId = useNavigationStore((s) => s.playlistDetailId);
  const viewPlaylist = useNavigationStore((s) => s.viewPlaylist);
  const backFromPlaylist = useNavigationStore((s) => s.backFromPlaylist);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  // Dialog's focus-trap effect depends on [open, onClose] and refocuses
  // the dialog's first focusable element every time it re-runs — a
  // fresh inline closure here would re-run it on every keystroke
  // (newName changes on every character), yanking focus away from the
  // input after each letter. Same fix as MetadataEditDialog's
  // handleClose (Phase 10 bug-hunt).
  const closeCreate = useCallback(() => setCreateOpen(false), []);

  if (selectedId !== null) {
    return <PlaylistDetail playlistId={selectedId} onBack={backFromPlaylist} />;
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const id = await create(name);
    setNewName("");
    setCreateOpen(false);
    viewPlaylist(id);
  }

  return (
    <div className="op-view">
      <ViewHeader title="Playlists" />

      {!loading && playlists.length === 0 ? (
        <EmptyState
          icon="list"
          title="No playlists"
          description="Create your first playlist from an album, artist, song, or your queue."
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              New Playlist
            </Button>
          }
        />
      ) : (
        <>
          <div className="op-playlists__toolbar">
            <Button variant="secondary" onClick={() => setCreateOpen(true)}>
              New Playlist
            </Button>
          </div>
          <div className="op-playlists__list">
            {playlists.map((playlist) => (
              <MediaRow
                key={playlist.id}
                artworkSeed={playlist.name}
                title={playlist.name}
                subtitle={
                  playlist.description ||
                  `${playlist.track_count} song${playlist.track_count === 1 ? "" : "s"}`
                }
                onClick={() => viewPlaylist(playlist.id)}
                actions={[
                  {
                    id: "delete",
                    label: "Delete Playlist",
                    danger: true,
                    onSelect: () =>
                      confirm({
                        title: "Delete Playlist",
                        description: `"${playlist.name}" will be permanently deleted. This can't be undone.`,
                        confirmLabel: "Delete",
                        onConfirm: () => void remove(playlist.id),
                      }),
                  },
                ]}
              />
            ))}
          </div>
        </>
      )}

      <Dialog
        open={createOpen}
        onClose={closeCreate}
        title="New Playlist"
        footer={
          <>
            <Button variant="ghost" onClick={closeCreate}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void handleCreate()}>
              Create
            </Button>
          </>
        }
      >
        <Input
          label="Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
          autoFocus
        />
      </Dialog>
    </div>
  );
}
