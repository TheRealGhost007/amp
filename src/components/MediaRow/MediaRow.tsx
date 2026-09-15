import { ButtonHTMLAttributes, ReactNode } from "react";
import { Artwork } from "../Artwork/Artwork";
import { Icon } from "../Icon/Icon";
import "./MediaRow.css";

interface MediaRowProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  artworkSrc?: string | null;
  artworkSeed: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  active?: boolean;
  favorite?: boolean;
  onToggleFavorite?: () => void;
}

/** The one shared row component for songs/albums/artists/playlists in
 * lists — spec §31 asks for a single reusable primitive here rather than
 * per-view bespoke rows. */
export function MediaRow({
  artworkSrc,
  artworkSeed,
  title,
  subtitle,
  trailing,
  active = false,
  favorite,
  onToggleFavorite,
  className,
  ...rest
}: MediaRowProps) {
  return (
    <button
      className={["op-media-row", active && "op-media-row--active", className]
        .filter(Boolean)
        .join(" ")}
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
    </button>
  );
}
