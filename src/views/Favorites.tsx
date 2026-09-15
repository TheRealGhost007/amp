import { EmptyState } from "../components";
import { ViewHeader } from "./ViewHeader";
import "./views.css";

export function Favorites() {
  return (
    <div className="op-view">
      <ViewHeader title="Favorites" />
      <EmptyState
        icon="heart"
        title="No favorites yet"
        description="Favorite a track or album and it'll show up here."
      />
    </div>
  );
}
