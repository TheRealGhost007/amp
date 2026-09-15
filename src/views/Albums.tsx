import { EmptyState } from "../components";
import { ViewHeader } from "./ViewHeader";
import "./views.css";

export function Albums() {
  return (
    <div className="op-view">
      <ViewHeader title="Albums" />
      <EmptyState
        icon="disc"
        title="No albums yet"
        description="Albums appear here once your library has been scanned."
      />
    </div>
  );
}
