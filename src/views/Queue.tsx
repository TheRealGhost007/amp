import { Card, EmptyState, MediaRow } from "../components";
import { usePlaybackStore } from "../store/playbackStore";
import { useNowPlaying } from "../player/useNowPlaying";
import { ViewHeader } from "./ViewHeader";
import "./views.css";

export function Queue() {
  const { track } = useNowPlaying();
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  if (!track) {
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
          artworkSeed={`${track.artist_name ?? "Unknown Artist"} — ${track.album_title ?? track.title}`}
          title={track.title}
          subtitle={track.artist_name ?? (isPlaying ? "Playing" : "Paused")}
          active
        />
      </Card>
    </div>
  );
}
