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
import { Button, Card, EmptyState, MediaRow, SortableRow } from "../components";
import { pathToFileUri } from "../lib/ipc";
import { useNowPlaying } from "../player/useNowPlaying";
import { usePlaybackStore } from "../store/playbackStore";
import { useQueueStore } from "../store/queueStore";
import { ViewHeader } from "./ViewHeader";
import "./views.css";
import "./Queue.css";

export function Queue() {
  const { track } = useNowPlaying();
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const playNow = usePlaybackStore((s) => s.playNow);
  const items = useQueueStore((s) => s.items);
  const removeFromQueue = useQueueStore((s) => s.remove);
  const reorderQueue = useQueueStore((s) => s.reorder);
  const clearQueue = useQueueStore((s) => s.clear);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    void reorderQueue(arrayMove(items, oldIndex, newIndex).map((item) => item.id));
  }

  if (!track && items.length === 0) {
    return (
      <div className="op-view">
        <ViewHeader title="Queue" />
        <EmptyState
          icon="queue"
          title="Queue is empty"
          description="Play something and whatever comes next will show up here."
        />
      </div>
    );
  }

  return (
    <div className="op-view">
      <ViewHeader title="Queue" subtitle={track ? "Now playing" : undefined} />
      {track && (
        <Card>
          <MediaRow
            artworkSeed={`${track.artist_name ?? "Unknown Artist"} — ${track.album_title ?? track.title}`}
            title={track.title}
            subtitle={track.artist_name ?? (isPlaying ? "Playing" : "Paused")}
            active
          />
        </Card>
      )}

      <div className="op-queue__up-next">
        <div className="op-queue__up-next-header">
          <h2 className="op-queue__up-next-title">
            Up Next {items.length > 0 && `(${items.length})`}
          </h2>
          {items.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => void clearQueue()}>
              Clear Queue
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="op-queue__empty-hint">
            Nothing queued — add tracks from your library to keep the music going.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="op-queue__list">
                {items.map((item) => (
                  <SortableRow key={item.id} id={item.id} label={item.track.title}>
                    <MediaRow
                      artworkSeed={`${item.track.artist_name ?? "Unknown Artist"} — ${item.track.album_title ?? item.track.title}`}
                      title={item.track.title}
                      subtitle={item.track.artist_name ?? "Unknown Artist"}
                      onClick={() => {
                        // Clicking a queued track jumps straight to it and
                        // takes it out of the queue (it's playing now, not
                        // upcoming) — everything else in the queue is left
                        // exactly where it was.
                        void removeFromQueue(item.id).then(() =>
                          playNow({
                            id: item.track.id,
                            uri: pathToFileUri(item.track.path),
                          }),
                        );
                      }}
                      actions={[
                        {
                          id: "remove",
                          label: "Remove from Queue",
                          onSelect: () => void removeFromQueue(item.id),
                        },
                      ]}
                    />
                  </SortableRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
