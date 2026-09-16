import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "../components";
import { useLibrary } from "../context/LibraryContext";
import { library, pathToFileUri, type TrackListItem } from "../lib/ipc";
import { useCommandPaletteStore } from "../store/commandPaletteStore";
import { useNavigationStore } from "../store/navigationStore";
import { usePlaybackStore } from "../store/playbackStore";
import { usePlaylistsStore } from "../store/playlistsStore";
import { SIDEBAR_ITEMS } from "../shell/views";
import "./CommandPalette.css";

interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: IconName;
  onSelect: () => void;
}

const SEARCH_DEBOUNCE_MS = 150;
const MAX_RESULTS_PER_GROUP = 6;

/** Ctrl+K palette (spec §14/§9's command-palette entry): a static
 * navigation-command registry plus live search over tracks (the Phase 6
 * FTS5 backend) and client-side substring matches over albums/artists/
 * playlists (all already loaded via `LibraryContext`/`playlistsStore`,
 * so no new backend query is needed for those three). Deliberately no
 * new dependency — fuzzy-enough substring matching plus a short,
 * curated result list per group is sufficient at this scale. */
export function CommandPalette() {
  const open = useCommandPaletteStore((s) => s.open);
  const close = useCommandPaletteStore((s) => s.close);
  const navigate = useNavigationStore((s) => s.navigate);
  const viewArtist = useNavigationStore((s) => s.viewArtist);
  const viewAlbum = useNavigationStore((s) => s.viewAlbum);
  const viewPlaylist = useNavigationStore((s) => s.viewPlaylist);
  const playNow = usePlaybackStore((s) => s.playNow);
  const { albums, artists } = useLibrary();
  const playlists = usePlaylistsStore((s) => s.items);

  const [query, setQuery] = useState("");
  const [trackResults, setTrackResults] = useState<TrackListItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Resetting query/results/selection when `open` flips true is a
  // React-recommended synchronous render-time adjustment
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes),
  // not a `useEffect` — calling setState directly inside an effect body
  // causes an extra cascading render (already fixed twice elsewhere in
  // this codebase for the same reason).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setTrackResults([]);
      setActiveIndex(0);
    }
  }

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      library.search(query).then((results) => {
        if (!cancelled) setTrackResults(results);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, open]);

  const trimmed = query.trim().toLowerCase();

  const items = useMemo<PaletteItem[]>(() => {
    const sections: PaletteItem[][] = [];

    const navItems: PaletteItem[] = SIDEBAR_ITEMS.filter((item) =>
      trimmed ? item.label.toLowerCase().includes(trimmed) : true,
    ).map((item) => ({
      id: `nav-${item.id}`,
      label: `Go to ${item.label}`,
      icon: item.icon,
      onSelect: () => navigate(item.id),
    }));
    sections.push(navItems);

    if (trimmed) {
      const trackItems: PaletteItem[] = trackResults
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((track) => ({
          id: `track-${track.id}`,
          label: track.title,
          sublabel: track.artist_name ?? "Unknown Artist",
          icon: "play",
          onSelect: () => void playNow({ id: track.id, uri: pathToFileUri(track.path) }),
        }));
      sections.push(trackItems);

      const albumItems: PaletteItem[] = albums
        .filter((a) => a.title.toLowerCase().includes(trimmed))
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((album) => ({
          id: `album-${album.id}`,
          label: album.title,
          sublabel: album.artist_name ?? "Unknown Artist",
          icon: "disc",
          onSelect: () => viewAlbum(album.id),
        }));
      sections.push(albumItems);

      const artistItems: PaletteItem[] = artists
        .filter((a) => a.name.toLowerCase().includes(trimmed))
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((artist) => ({
          id: `artist-${artist.id}`,
          label: artist.name,
          sublabel: `${artist.track_count} song${artist.track_count === 1 ? "" : "s"}`,
          icon: "user",
          onSelect: () => viewArtist(artist.id),
        }));
      sections.push(artistItems);

      const playlistItems: PaletteItem[] = playlists
        .filter((p) => p.name.toLowerCase().includes(trimmed))
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((playlist) => ({
          id: `playlist-${playlist.id}`,
          label: playlist.name,
          icon: "list",
          onSelect: () => viewPlaylist(playlist.id),
        }));
      sections.push(playlistItems);
    }

    return sections.flat();
  }, [
    trimmed,
    trackResults,
    albums,
    artists,
    playlists,
    navigate,
    viewAlbum,
    viewArtist,
    viewPlaylist,
    playNow,
  ]);

  // Same render-time-adjustment pattern as the open/close reset above:
  // when the result count changes (the user typed a character), the
  // previously active index may now point past the end or at a
  // different item, so it's re-derived here rather than in an effect.
  const [itemsLengthForActiveIndex, setItemsLengthForActiveIndex] = useState(
    items.length,
  );
  if (items.length !== itemsLengthForActiveIndex) {
    setItemsLengthForActiveIndex(items.length);
    setActiveIndex(0);
  }

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function select(item: PaletteItem | undefined) {
    if (!item) return;
    item.onSelect();
    close();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        items.length === 0 ? 0 : (i - 1 + items.length) % items.length,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(items[activeIndex]);
    }
  }

  if (!open) return null;

  return createPortal(
    <div className="op-palette-backdrop" onMouseDown={close}>
      <div
        className="op-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="op-palette__search">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            className="op-palette__input"
            placeholder="Search tracks, albums, artists, playlists, or jump to a view…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Command palette search"
          />
          <kbd className="op-palette__kbd">Esc</kbd>
        </div>
        <div className="op-palette__list" ref={listRef} role="listbox">
          {items.length === 0 && <p className="op-palette__empty">No matches.</p>}
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              data-index={index}
              role="option"
              aria-selected={index === activeIndex}
              className={[
                "op-palette__item",
                index === activeIndex && "op-palette__item--active",
              ]
                .filter(Boolean)
                .join(" ")}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(item)}
            >
              <Icon name={item.icon} size={16} />
              <span className="op-palette__item-label">{item.label}</span>
              {item.sublabel && (
                <span className="op-palette__item-sublabel">{item.sublabel}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
