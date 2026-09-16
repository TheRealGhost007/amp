import { useEffect, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Icon,
  Input,
  MediaRow,
  SortableRow,
} from "../components";
import {
  pathToFileUri,
  playlists as playlistsApi,
  type PlaylistTrackItem,
} from "../lib/ipc";
import { usePlaybackStore } from "../store/playbackStore";
import { usePlaylistsStore } from "../store/playlistsStore";
import "./views.css";
import "./PlaylistDetail.css";

interface PlaylistDetailProps {
  playlistId: number;
  onBack: () => void;
}

export function PlaylistDetail({ playlistId, onBack }: PlaylistDetailProps) {
  const summary = usePlaylistsStore((s) => s.items.find((p) => p.id === playlistId));
  const playlistsLoading = usePlaylistsStore((s) => s.loading);
  const rename = usePlaylistsStore((s) => s.rename);
  const setDescription = usePlaylistsStore((s) => s.setDescription);
  const removePlaylist = usePlaylistsStore((s) => s.remove);
  const playNow = usePlaybackStore((s) => s.playNow);

  const [tracks, setTracks] = useState<PlaylistTrackItem[]>([]);
  // Derived rather than a plain flag toggled inside the effect (which
  // would need a synchronous setState(true) at the top of the effect
  // body — the same react-hooks/set-state-in-effect issue already fixed
  // once in LibraryContext.tsx) — `loading` is just "the displayed
  // tracks don't belong to the currently-requested playlist yet",
  // correct for both the first mount and switching between playlists.
  const [loadedForId, setLoadedForId] = useState<number | null>(null);
  const loading = loadedForId !== playlistId;
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    playlistsApi.listTracks(playlistId).then((items) => {
      if (!cancelled) {
        setTracks(items);
        setLoadedForId(playlistId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [playlistId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tracks.findIndex((item) => item.id === active.id);
    const newIndex = tracks.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(tracks, oldIndex, newIndex);
    setTracks(reordered);
    void playlistsApi.reorderTracks(
      playlistId,
      reordered.map((item) => item.id),
    );
  }

  function handleRemoveTrack(playlistTrackId: number) {
    setTracks((current) => current.filter((item) => item.id !== playlistTrackId));
    void playlistsApi.removeTrack(playlistTrackId);
  }

  useEffect(() => {
    // Distinguishing "hasn't loaded yet" from "genuinely gone" matters:
    // right after mount, playlistsStore's own fetch may not have
    // resolved yet, so `summary` is briefly undefined for a playlist
    // that really does exist. Only treat it as deleted (e.g. removed
    // from another view while this screen was open) once loading has
    // settled. A parent setState call belongs in an effect, never
    // directly in the render body (React flags calling it mid-render).
    if (!playlistsLoading && !summary) onBack();
  }, [playlistsLoading, summary, onBack]);

  if (playlistsLoading || !summary) {
    return null;
  }

  return (
    <div className="op-view">
      <button className="op-playlist-detail__back" onClick={onBack}>
        <Icon name="chevron-left" size={16} />
        All Playlists
      </button>

      <div className="op-playlist-detail__header">
        <div>
          <h1 className="op-view__title">{summary.name}</h1>
          {summary.description && (
            <p className="op-view__subtitle">{summary.description}</p>
          )}
        </div>
        <div className="op-playlist-detail__header-actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRenameValue(summary.name);
              setRenameOpen(true);
            }}
          >
            Rename
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDescriptionValue(summary.description ?? "");
              setDescriptionOpen(true);
            }}
          >
            Edit Description
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
        </div>
      </div>

      {!loading && tracks.length === 0 ? (
        <EmptyState
          icon="list"
          title="No tracks yet"
          description="Add tracks to this playlist from your library."
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={tracks.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="op-playlist-detail__list">
              {tracks.map((item) => (
                <SortableRow key={item.id} id={item.id} label={item.track.title}>
                  <MediaRow
                    artworkSeed={`${item.track.artist_name ?? "Unknown Artist"} — ${item.track.album_title ?? item.track.title}`}
                    title={item.track.title}
                    subtitle={item.track.artist_name ?? "Unknown Artist"}
                    onClick={() =>
                      void playNow({
                        id: item.track.id,
                        uri: pathToFileUri(item.track.path),
                      })
                    }
                    actions={[
                      {
                        id: "remove",
                        label: "Remove from Playlist",
                        onSelect: () => handleRemoveTrack(item.id),
                      },
                    ]}
                  />
                </SortableRow>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename Playlist"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const name = renameValue.trim();
                if (name) void rename(playlistId, name);
                setRenameOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Input
          label="Name"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          autoFocus
        />
      </Dialog>

      <Dialog
        open={descriptionOpen}
        onClose={() => setDescriptionOpen(false)}
        title="Edit Description"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDescriptionOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                void setDescription(playlistId, descriptionValue.trim() || null);
                setDescriptionOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Input
          label="Description"
          value={descriptionValue}
          onChange={(e) => setDescriptionValue(e.target.value)}
          autoFocus
        />
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Playlist"
        description={`"${summary.name}" will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          void removePlaylist(playlistId);
          onBack();
        }}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
