import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Artwork, EmptyState } from "../components";
import { useLibrary } from "../context/LibraryContext";
import { useElementWidth } from "../lib/useElementWidth";
import { ViewHeader } from "./ViewHeader";
import "./views.css";
import "./Library.css";
import "./Albums.css";

const TILE_WIDTH = 168;
const TILE_GAP = 20;
const TILE_HEIGHT = 168 + 52; // artwork + two lines of text

export function Albums() {
  const { albums, loading } = useLibrary();
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerWidth = useElementWidth(scrollRef);

  const columns = Math.max(
    1,
    Math.floor((containerWidth + TILE_GAP) / (TILE_WIDTH + TILE_GAP)),
  );
  const rowCount = Math.ceil(albums.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TILE_HEIGHT + TILE_GAP,
    overscan: 3,
  });

  const rows = useMemo(() => {
    const chunks: (typeof albums)[] = [];
    for (let i = 0; i < albums.length; i += columns) {
      chunks.push(albums.slice(i, i + columns));
    }
    return chunks;
  }, [albums, columns]);

  if (!loading && albums.length === 0) {
    return (
      <div className="op-view">
        <ViewHeader title="Albums" />
        <EmptyState
          icon="disc"
          title="No albums yet"
          description="Albums appear here once your library has been scanned."
        />
      </div>
    );
  }

  return (
    <div className="op-view op-view--flush">
      <ViewHeader
        title="Albums"
        subtitle={loading ? "Loading…" : `${albums.length} albums`}
      />
      <div className="op-library__list" ref={scrollRef}>
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              className="op-album-grid__row"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {rows[virtualRow.index]?.map((album) => (
                <div key={album.id} className="op-album-tile">
                  <Artwork
                    seed={`${album.artist_name ?? "Unknown Artist"} — ${album.title}`}
                    alt=""
                    size={TILE_WIDTH}
                  />
                  <p className="op-album-tile__title">{album.title}</p>
                  <p className="op-album-tile__subtitle">
                    {album.artist_name ?? "Unknown Artist"}
                    {album.year ? ` · ${album.year}` : ""}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
