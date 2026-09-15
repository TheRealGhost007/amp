import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button, EmptyState, Input, MediaRow } from "../components";
import { useLibrary } from "../context/LibraryContext";
import { usePlaybackStore } from "../store/playbackStore";
import { library, pathToFileUri, type TrackListItem } from "../lib/ipc";
import { formatDuration } from "../lib/format";
import { ViewHeader } from "./ViewHeader";
import "./views.css";
import "./Library.css";

const SEARCH_DEBOUNCE_MS = 200;
const ROW_HEIGHT = 56;

export function Library() {
  const { tracks, loading, addFolder } = useLibrary();
  const playNow = usePlaybackStore((s) => s.playNow);
  const currentTrackId = usePlaybackStore((s) => s.currentTrack?.id);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TrackListItem[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      library
        .search(query)
        .then(setSearchResults)
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const displayedTracks = searchResults ?? tracks;

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: displayedTracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  async function handlePlay(track: TrackListItem) {
    await playNow({ id: track.id, uri: pathToFileUri(track.path) });
  }

  if (!loading && tracks.length === 0) {
    return (
      <div className="op-view">
        <ViewHeader title="Music Library" />
        <EmptyState
          icon="library"
          title="No music yet"
          description="Add a folder to start building your library."
          action={
            <Button variant="primary" onClick={() => addFolder()}>
              Add Folder
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="op-view op-view--flush">
      <ViewHeader
        title="Music Library"
        subtitle={
          loading
            ? "Loading…"
            : `${tracks.length.toLocaleString()} song${tracks.length === 1 ? "" : "s"}`
        }
      />
      <div className="op-library__toolbar">
        <Input
          label="Search"
          placeholder="Search your library…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant="secondary" onClick={() => addFolder()}>
          Add Folder
        </Button>
      </div>

      {searchResults !== null && searchResults.length === 0 && !searching && (
        <EmptyState
          icon="search"
          title="No results"
          description="Try searching for another artist, album, or track."
        />
      )}

      {(searchResults === null || searchResults.length > 0) && (
        <div className="op-library__list" ref={scrollRef}>
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const track = displayedTracks[virtualRow.index];
              return (
                <div
                  key={track.id}
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
                    artworkSeed={`${track.artist_name ?? "Unknown Artist"} — ${track.album_title ?? track.title}`}
                    title={track.title}
                    subtitle={track.artist_name ?? "Unknown Artist"}
                    trailing={formatDuration(track.duration_ms)}
                    active={track.id === currentTrackId}
                    onClick={() => handlePlay(track)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
