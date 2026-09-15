import type { IconName } from "../components";

export type ViewId =
  | "home"
  | "library"
  | "albums"
  | "artists"
  | "playlists"
  | "favorites"
  | "recently-played"
  | "queue"
  | "downloads"
  | "settings";

export interface SidebarItem {
  id: ViewId;
  label: string;
  icon: IconName;
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "library", label: "Music Library", icon: "library" },
  { id: "albums", label: "Albums", icon: "disc" },
  { id: "artists", label: "Artists", icon: "user" },
  { id: "playlists", label: "Playlists", icon: "list" },
  { id: "favorites", label: "Favorites", icon: "heart" },
  { id: "recently-played", label: "Recently Played", icon: "clock" },
  { id: "queue", label: "Queue", icon: "queue" },
  { id: "downloads", label: "Downloads", icon: "download" },
  { id: "settings", label: "Settings", icon: "settings" },
];
