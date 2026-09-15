import { EmptyState } from "../components";
import { ViewHeader } from "./ViewHeader";
import "./views.css";

export function Playlists() {
  return (
    <div className="op-view">
      <ViewHeader title="Playlists" />
      <EmptyState
        icon="list"
        title="No playlists"
        description="Create your first playlist from an album, artist, song, or your queue."
      />
    </div>
  );
}
