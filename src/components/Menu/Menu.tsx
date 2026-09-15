import { RefObject, useRef } from "react";
import { Popover } from "../Popover/Popover";
import { Icon, IconName } from "../Icon/Icon";
import "./Menu.css";

export interface MenuItemSpec {
  id: string;
  label: string;
  icon?: IconName;
  /** Shows a check mark in the icon slot, reserving the same space
   * whether or not it's checked so option labels stay aligned
   * (used by Dropdown's selection list). */
  checked?: boolean;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  onSelect?: () => void;
}

interface MenuProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  items: MenuItemSpec[];
}

/** The one shared menu component used for every context menu and dropdown
 * panel in the app (spec §15: no bespoke per-view menus). */
export function Menu({ anchorRef, open, onClose, items }: MenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(e: React.KeyboardEvent) {
    const focusable = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']:not(:disabled)",
      ) ?? [],
    );
    const currentIndex = focusable.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const next =
        focusable[(currentIndex + delta + focusable.length) % focusable.length];
      next?.focus();
    }
  }

  return (
    <Popover anchorRef={anchorRef} open={open} onClose={onClose}>
      <div ref={listRef} className="op-menu" role="menu" onKeyDown={handleKeyDown}>
        {items.map((item) => (
          <div key={item.id}>
            {item.separatorBefore && <div className="op-menu__separator" />}
            <button
              role="menuitem"
              type="button"
              disabled={item.disabled}
              className={["op-menu__item", item.danger && "op-menu__item--danger"]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                item.onSelect?.();
                onClose();
              }}
            >
              {item.icon && <Icon name={item.icon} size={16} />}
              {item.checked !== undefined && (
                <span className="op-menu__check">
                  {item.checked && <Icon name="check" size={16} />}
                </span>
              )}
              <span className="op-menu__label">{item.label}</span>
              {item.shortcut && (
                <span className="op-menu__shortcut">{item.shortcut}</span>
              )}
            </button>
          </div>
        ))}
      </div>
    </Popover>
  );
}
