import { Card, EmptyState, MediaRow } from "../components";
import { usePlaybackStore } from "../store/playbackStore";
import { ViewHeader } from "./ViewHeader";
import "./views.css";

export function Queue() {
  const currentTrack = usePlaybackStore((s) => s.currentTrack);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  if (!currentTrack) {
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
      <ViewHeader title="Queue" subtitle="Now playing" />
      <Card>
        <MediaRow
          artworkSeed={currentTrack.uri}
          title={`Track #${currentTrack.id}`}
          subtitle={isPlaying ? "Playing" : "Paused"}
          active
        />
      </Card>
    </div>
  );
}
