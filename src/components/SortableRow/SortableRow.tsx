import { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "../Icon/Icon";
import "./SortableRow.css";

interface SortableRowProps {
  id: number;
  label: string;
  children: ReactNode;
}

/** Drag-handle chrome shared by every `@dnd-kit/sortable` list in the app
 * (Queue, playlist detail) — callers keep full control of the row's own
 * content (typically a `MediaRow`), this only wraps it with a handle and
 * the transform/transition dnd-kit needs. */
export function SortableRow({ id, label, children }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id,
    });

  return (
    <div
      ref={setNodeRef}
      className={["op-sortable-row", isDragging && "op-sortable-row--dragging"]
        .filter(Boolean)
        .join(" ")}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <span
        className="op-sortable-row__handle"
        aria-label={`Reorder ${label}`}
        {...attributes}
        {...listeners}
      >
        <Icon name="grip" size={16} />
      </span>
      <div className="op-sortable-row__content">{children}</div>
    </div>
  );
}
