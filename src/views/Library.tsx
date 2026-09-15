import { EmptyState } from "../components";
import { ViewHeader } from "./ViewHeader";
import "./views.css";

export function Library() {
  return (
    <div className="op-view">
      <ViewHeader title="Music Library" />
      <EmptyState
        icon="library"
        title="No music yet"
        description="Add a folder to start building your library. Scanning and folder selection land in an upcoming phase."
      />
    </div>
  );
}
