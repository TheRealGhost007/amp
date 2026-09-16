import { useEffect, useState, type ComponentType } from "react";
import { Sidebar } from "./Sidebar";
import type { ViewId } from "./views";
import { settings } from "../lib/ipc";
import { useNavigationStore } from "../store/navigationStore";
import { Home } from "../views/Home";
import { Library } from "../views/Library";
import { Albums } from "../views/Albums";
import { Artists } from "../views/Artists";
import { Playlists } from "../views/Playlists";
import { Favorites } from "../views/Favorites";
import { RecentlyPlayed } from "../views/RecentlyPlayed";
import { Queue } from "../views/Queue";
import { Downloads } from "../views/Downloads";
import { Settings } from "../views/Settings";
import { PlayerDock } from "../player/PlayerDock";
import { GlobalDialogs } from "./GlobalDialogs";
import { CommandPalette } from "../palette/CommandPalette";
import "./Shell.css";

const SIDEBAR_COLLAPSED_KEY = "appearance.sidebar_collapsed";

const VIEWS: Record<ViewId, ComponentType> = {
  home: Home,
  library: Library,
  albums: Albums,
  artists: Artists,
  playlists: Playlists,
  favorites: Favorites,
  "recently-played": RecentlyPlayed,
  queue: Queue,
  downloads: Downloads,
  settings: Settings,
};

export function Shell() {
  const activeView = useNavigationStore((s) => s.activeView);
  const navigate = useNavigationStore((s) => s.navigate);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    settings
      .get<boolean>(SIDEBAR_COLLAPSED_KEY)
      .then((saved) => {
        if (saved !== null) setCollapsed(saved);
      })
      .catch(() => {});
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      settings.set(SIDEBAR_COLLAPSED_KEY, next).catch(() => {});
      return next;
    });
  }

  const ActiveView = VIEWS[activeView];

  return (
    <div className="op-shell">
      <div className="op-shell__body">
        <Sidebar
          activeView={activeView}
          collapsed={collapsed}
          onNavigate={navigate}
          onToggleCollapsed={toggleCollapsed}
        />
        <main className="op-shell__main">
          <ActiveView />
        </main>
      </div>
      <PlayerDock onOpenQueue={() => navigate("queue")} />
      <GlobalDialogs />
      <CommandPalette />
    </div>
  );
}
