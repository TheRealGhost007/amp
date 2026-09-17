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
  | "folder"
  | "home"
  | "library"
  | "disc"
  | "user"
  | "list"
  | "clock"
  | "download"
  | "settings"
  | "chevron-left"
  | "grip";

const PATHS: Record<IconName, string> = {
  play: "M7 5.5v13l11-6.5-11-6.5Z",
  pause: "M7.5 5.5h3v13h-3v-13Zm6 0h3v13h-3v-13Z",
  previous: "M7 5.5v13M18 5.5 8 12l10 6.5v-13Z",
  next: "M17 5.5v13M6 5.5 16 12 6 18.5v-13Z",
  shuffle: "M4 6h3.5L15 17h4.5M4 18h3.5L11 13M15.5 6H19v3.5M19 14.5V18h-3.5",
  repeat:
    "M6 8h11.5a2.5 2.5 0 0 1 2.5 2.5V12M18 16H6.5A2.5 2.5 0 0 1 4 13.5V12M8.5 5.5 6 8l2.5 2.5M15.5 18.5 18 16l-2.5-2.5",
  // Symmetric about x=12 (each control point on one side is exactly
  // `24 - x` of its mirror on the other) — the previous path's two
  // lobes weren't actual mirror images of each other and rendered as a
  // visibly lopsided heart everywhere this icon is used.
  heart:
    "M12 20C12 20 2.5 14.2 2.5 8.8C2.5 6.1 4.6 4 7.3 4C9.1 4 10.7 4.9 12 6.6C13.3 4.9 14.9 4 16.7 4C19.4 4 21.5 6.1 21.5 8.8C21.5 14.2 12 20 12 20Z",
  "heart-filled":
    "M12 20C12 20 2.5 14.2 2.5 8.8C2.5 6.1 4.6 4 7.3 4C9.1 4 10.7 4.9 12 6.6C13.3 4.9 14.9 4 16.7 4C19.4 4 21.5 6.1 21.5 8.8C21.5 14.2 12 20 12 20Z",
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
  home: "M4 11.5 12 4l8 7.5M6 10v9h4v-5h4v5h4v-9",
  library: "M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z",
  disc: "M4.5 12a7.5 7.5 0 1 0 15 0 7.5 7.5 0 0 0-15 0ZM10 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z",
  user: "M9 7a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM5 20c0-4 3.5-6.5 7-6.5s7 2.5 7 6.5",
  list: "M4 6.5h16M4 12h16M4 17.5h10",
  clock: "M4.5 12a7.5 7.5 0 1 0 15 0 7.5 7.5 0 0 0-15 0ZM12 7.5v4.5l3 2",
  download:
    "M12 4v11m0 0-4-4m4 4 4-4M5 17.5v2A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-2",
  settings:
    "M4 7h3.25m3.5 0H20M4 12h9.25m3.5 0H20M4 17h5.25m3.5 0H20M7.25 7a1.75 1.75 0 1 0 3.5 0 1.75 1.75 0 0 0-3.5 0ZM13.25 12a1.75 1.75 0 1 0 3.5 0 1.75 1.75 0 0 0-3.5 0ZM9.25 17a1.75 1.75 0 1 0 3.5 0 1.75 1.75 0 0 0-3.5 0Z",
  "chevron-left": "M15 6 9 12l6 6",
  grip: "M9 7v.01M9 12v.01M9 17v.01M15 7v.01M15 12v.01M15 17v.01",
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}

// Every current call site explicitly passes `size` — 16 is what the app
// actually standardizes on almost everywhere (sidebar/menu/transport
// icons), not 18. Aligning the default so a future caller that forgets
// to pass `size` matches its neighbors instead of silently rendering
// larger than everything around it.
export function Icon({ name, size = 16, className, title }: IconProps) {
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
