import { HTMLAttributes } from "react";
import "./Card.css";

type CardProps = HTMLAttributes<HTMLDivElement>;

/** A raised container. Flat surfaces (sidebar, settings panels) should
 * NOT use Card — reserve it for genuinely distinct content groupings
 * (a quick-access shortcut, an album grid tile). No shadow: elevation
 * comes from the background layering scale, not a drop shadow, per
 * omarchy-app-modern-design's "subtle depth" pillar. */
export function Card({ className, ...rest }: CardProps) {
  return <div className={["op-card", className].filter(Boolean).join(" ")} {...rest} />;
}
