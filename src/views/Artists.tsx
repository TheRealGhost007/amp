import { EmptyState } from "../components";
import { ViewHeader } from "./ViewHeader";
import "./views.css";

export function Artists() {
  return (
    <div className="op-view">
      <ViewHeader title="Artists" />
      <EmptyState
        icon="user"
        title="No artists yet"
        description="Artists appear here once your library has been scanned."
      />
    </div>
  );
}
