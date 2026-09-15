/**
 * Originated line-icon set (not copied from a named icon library, per
 * omarchy-app-modern-design ground rule 8): 24x24 grid, 1.75px stroke,
 * round caps/joins, no fills. One style used everywhere in the app.
 */
import "./Icon.css";

export type IconName =
  | "play"
  | "pause"
  | "previous"
  | "next"
  | "shuffle"
  | "repeat"
  | "heart"
  | "heart-filled"
  | "volume"
  | "search"
  | "close"
  | "check"
  | "chevron-down"
  | "dots"
  | "queue"
  | "folder";

const PATHS: Record<IconName, string> = {
  play: "M7 5.5v13l11-6.5-11-6.5Z",
  pause: "M7.5 5.5h3v13h-3v-13Zm6 0h3v13h-3v-13Z",
  previous: "M7 5.5v13M18 5.5 8 12l10 6.5v-13Z",
  next: "M17 5.5v13M6 5.5 16 12 6 18.5v-13Z",
  shuffle: "M4 6h3.5L15 17h4.5M4 18h3.5L11 13M15.5 6H19v3.5M19 14.5V18h-3.5",
  repeat:
    "M6 8h11.5a2.5 2.5 0 0 1 2.5 2.5V12M18 16H6.5A2.5 2.5 0 0 1 4 13.5V12M8.5 5.5 6 8l2.5 2.5M15.5 18.5 18 16l-2.5-2.5",
  heart:
    "M12 20s-7-4.35-9.5-8.7C.7 8.1 2.2 5 5.3 5c1.9 0 3.3 1 3.7 2.4C9.4 6 10.8 5 12.7 5c3.1 0 4.6 3.1 2.8 6.3C18 15.65 12 20 12 20Z",
  "heart-filled":
    "M12 20s-7-4.35-9.5-8.7C.7 8.1 2.2 5 5.3 5c1.9 0 3.3 1 3.7 2.4C9.4 6 10.8 5 12.7 5c3.1 0 4.6 3.1 2.8 6.3C18 15.65 12 20 12 20Z",
  volume:
    "M4 9.5h3.5L12 6v12l-4.5-3.5H4v-5ZM15.5 9a4 4 0 0 1 0 6M17.7 6.8a7.5 7.5 0 0 1 0 10.4",
  search: "M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM20 20l-4.35-4.35",
  close: "M6 6l12 12M18 6 6 18",
  check: "M5 12.5 10 17 19 7",
  "chevron-down": "M6 9.5 12 15l6-5.5",
  dots: "M6 12h.01M12 12h.01M18 12h.01",
  queue: "M4 6.5h12M4 12h12M4 17.5h8M18 15v6M15 18h6",
  folder:
    "M4 7a1.5 1.5 0 0 1 1.5-1.5h4l1.7 2H18.5A1.5 1.5 0 0 1 20 9v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17V7Z",
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}

export function Icon({ name, size = 18, className, title }: IconProps) {
  const filled = name === "heart-filled";
  return (
    <svg
      className={["op-icon", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
