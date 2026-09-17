import { HTMLAttributes, KeyboardEvent, ReactNode, useRef, useState } from "react";
import { Artwork } from "../Artwork/Artwork";
import { Icon } from "../Icon/Icon";
import { Menu, type MenuItemSpec } from "../Menu/Menu";
import "./MediaRow.css";

interface MediaRowProps extends HTMLAttributes<HTMLDivElement> {
  artworkSrc?: string | null;
  artworkSeed: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  active?: boolean;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  /** Contextual actions ("Play Next", "Add to Queue", ...) shown behind
   * a "..." trigger — omit to render the row with no menu at all. */
  actions?: MenuItemSpec[];
}

/** The one shared row component for songs/albums/artists/playlists in
 * lists — spec §31 asks for a single reusable primitive here rather than
 * per-view bespoke rows.
 *
 * A `role="button"` div, not a real `<button>`: the row also contains
 * two independently-focusable controls of its own (the favorite toggle,
 * the "..." menu trigger), and interactive content nested inside a real
 * `<button>` is invalid HTML — WebKitGTK (this app's actual runtime)
 * commonly exposes a `<button>` to the accessibility tree as a leaf
 * node, which risked those inner controls not being reachable or
 * announced correctly by assistive technology despite having their own
 * `aria-label`s. Enter/Space activation is wired up manually below to
 * replace what a real button would otherwise give for free. */
export function MediaRow({
  artworkSrc,
  artworkSeed,
  title,
  subtitle,
  trailing,
  active = false,
  favorite,
  onToggleFavorite,
  actions,
  className,
  onClick,
  onKeyDown,
  ...rest
}: MediaRowProps) {
  const menuAnchorRef = useRef<HTMLSpanElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={["op-media-row", active && "op-media-row--active", className]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      <Artwork src={artworkSrc} seed={artworkSeed} alt="" size={40} />
      <span className="op-media-row__text">
        <span className="op-media-row__title">{title}</span>
        {subtitle && <span className="op-media-row__subtitle">{subtitle}</span>}
      </span>
      {onToggleFavorite && (
        <span
          role="button"
          tabIndex={0}
          className="op-media-row__favorite"
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={favorite}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }
          }}
        >
          <Icon name={favorite ? "heart-filled" : "heart"} size={16} />
        </span>
      )}
      {trailing && <span className="op-media-row__trailing">{trailing}</span>}
      {actions && actions.length > 0 && (
        <>
          <span
            ref={menuAnchorRef}
            role="button"
            tabIndex={0}
            className="op-media-row__menu-trigger"
            aria-label="More actions"
            aria-haspopup="menu"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((open) => !open);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen((open) => !open);
              }
            }}
          >
            <Icon name="dots" size={16} />
          </span>
          <Menu
            anchorRef={menuAnchorRef}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            items={actions}
          />
        </>
      )}
    </div>
  );
}
