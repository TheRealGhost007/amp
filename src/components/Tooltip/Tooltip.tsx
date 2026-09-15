import { ReactNode } from "react";
import "./Tooltip.css";

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: "top" | "right";
}

/** CSS-only hover/focus tooltip (no JS positioning needed for a short
 * label next to its own trigger) — used for the collapsed sidebar's
 * icon-only rail (spec §3: "preserve tooltips" when collapsed). The
 * child interactive element should still carry its own aria-label; this
 * is a visual affordance, not the accessible name. */
export function Tooltip({ label, children, side = "top" }: TooltipProps) {
  return (
    <span className={`op-tooltip-anchor op-tooltip-anchor--${side}`} data-tooltip={label}>
      {children}
    </span>
  );
}
