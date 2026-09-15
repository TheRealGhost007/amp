import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EmptyState, MediaRow } from "../components";
import { useLibrary } from "../context/LibraryContext";
import { ViewHeader } from "./ViewHeader";
import "./views.css";
import "./Library.css";

const ROW_HEIGHT = 56;

export function Artists() {
  const { artists, loading } = useLibrary();
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: artists.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  if (!loading && artists.length === 0) {
    return (
      <div className="op-view">
        <ViewHeader title="Artists" />
        <EmptyState
          icon="user"
          title="No artists yet"
          description="Artists appear here once your library has been scanned."
        />
      </div>
    );
  }

  return (
    <div className="op-view op-view--flush">
      <ViewHeader
        title="Artists"
        subtitle={loading ? "Loading…" : `${artists.length} artists`}
      />
      <div className="op-library__list" ref={scrollRef}>
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const artist = artists[virtualRow.index];
            return (
              <div
                key={artist.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <MediaRow
                  artworkSeed={artist.name}
                  title={artist.name}
                  subtitle={`${artist.album_count} album${artist.album_count === 1 ? "" : "s"}`}
                  trailing={`${artist.track_count} song${artist.track_count === 1 ? "" : "s"}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
