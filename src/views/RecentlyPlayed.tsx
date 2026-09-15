import { EmptyState } from "../components";
import { ViewHeader } from "./ViewHeader";
import "./views.css";

export function RecentlyPlayed() {
  return (
    <div className="op-view">
      <ViewHeader title="Recently Played" />
      <EmptyState
        icon="clock"
        title="Nothing played yet"
        description="Tracks you play will show up here, most recent first."
      />
    </div>
  );
}
