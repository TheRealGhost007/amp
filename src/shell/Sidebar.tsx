import { Icon, Tooltip } from "../components";
import { SIDEBAR_ITEMS, type ViewId } from "./views";
import "./Sidebar.css";

interface SidebarProps {
  activeView: ViewId;
  collapsed: boolean;
  onNavigate: (view: ViewId) => void;
  onToggleCollapsed: () => void;
}

export function Sidebar({
  activeView,
  collapsed,
  onNavigate,
  onToggleCollapsed,
}: SidebarProps) {
  return (
    <nav
      className={["op-sidebar", collapsed && "op-sidebar--collapsed"]
        .filter(Boolean)
        .join(" ")}
      aria-label="Main"
    >
      <div className="op-sidebar__header">
        {!collapsed && <span className="op-sidebar__brand">Amp</span>}
        <button
          className="op-sidebar__collapse-toggle"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
        >
          <Icon
            name="chevron-left"
            size={16}
            className={collapsed ? "op-icon--flipped" : undefined}
          />
        </button>
      </div>

      <ul className="op-sidebar__list">
        {SIDEBAR_ITEMS.map((item) => {
          const button = (
            <button
              className={[
                "op-sidebar__item",
                activeView === item.id && "op-sidebar__item--active",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={activeView === item.id ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon name={item.icon} size={18} />
              {!collapsed && <span className="op-sidebar__label">{item.label}</span>}
            </button>
          );
          return (
            <li key={item.id}>
              {collapsed ? (
                <Tooltip label={item.label} side="right">
                  {button}
                </Tooltip>
              ) : (
                button
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
