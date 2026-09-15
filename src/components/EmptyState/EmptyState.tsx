import { ReactNode } from "react";
import { Icon, IconName } from "../Icon/Icon";
import "./EmptyState.css";

interface EmptyStateProps {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}

/** Spec §28: every empty view gets one of these instead of a bare "no
 * data" — designed, not unfinished. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="op-empty-state">
      <div className="op-empty-state__icon">
        <Icon name={icon} size={28} />
      </div>
      <p className="op-empty-state__title">{title}</p>
      <p className="op-empty-state__description">{description}</p>
      {action && <div className="op-empty-state__action">{action}</div>}
    </div>
  );
}
