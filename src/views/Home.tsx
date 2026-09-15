import { EmptyState } from "../components";
import { ViewHeader } from "./ViewHeader";
import "./views.css";

export function Home() {
  return (
    <div className="op-view">
      <ViewHeader title="Home" />
      <EmptyState
        icon="home"
        title="Nothing to play yet"
        description="Add a music folder to your library and your recently played tracks, favorites, and recommendations will show up here."
      />
    </div>
  );
}
