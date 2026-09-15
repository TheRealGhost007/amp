import { EmptyState } from "../components";
import { ViewHeader } from "./ViewHeader";
import "./views.css";

export function Downloads() {
  return (
    <div className="op-view">
      <ViewHeader title="Downloads" />
      <EmptyState
        icon="download"
        title="No downloads"
        description="Downloaded tracks and offline content will appear here."
      />
    </div>
  );
}
