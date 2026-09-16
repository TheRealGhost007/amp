import { useState } from "react";
import { Button, Dialog, EmptyState, Input, MediaRow } from "../components";
import { useConfirmDialogStore } from "../store/confirmDialogStore";
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

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  if (selectedId !== null) {
    return <PlaylistDetail playlistId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const id = await create(name);
    setNewName("");
    setCreateOpen(false);
    setSelectedId(id);
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
                onClick={() => setSelectedId(playlist.id)}
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
        onClose={() => setCreateOpen(false)}
        title="New Playlist"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
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
