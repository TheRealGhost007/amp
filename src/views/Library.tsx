import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AddToPlaylistDialog,
  Button,
  EmptyState,
  Input,
  MediaRow,
  useToast,
} from "../components";
import { useLibrary } from "../context/LibraryContext";
import { usePlaybackStore } from "../store/playbackStore";
import { useQueueStore } from "../store/queueStore";
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
  const addToQueue = useQueueStore((s) => s.addToQueue);
  const queuePlayNext = useQueueStore((s) => s.playNext);
  const { show: showToast } = useToast();

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TrackListItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [addToPlaylistTrackId, setAddToPlaylistTrackId] = useState<number | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const handle = setTimeout(() => {
      library
        .search(query)
        .then((results) => {
          // A newer query's own debounce/request could resolve before
          // this one — e.g. type "cat", pause long enough to fire the
          // search, then type "s" before it resolves. Without this guard
          // an older, slower reply can overwrite the newer, correct one.
          if (!cancelled) setSearchResults(results);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
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
                    actions={[
                      {
                        id: "play-next",
                        label: "Play Next",
                        onSelect: () => {
                          void queuePlayNext(track.id);
                          showToast(`"${track.title}" will play next`, "success");
                        },
                      },
                      {
                        id: "add-to-queue",
                        label: "Add to Queue",
                        onSelect: () => {
                          void addToQueue(track.id);
                          showToast(`Added "${track.title}" to queue`, "success");
                        },
                      },
                      {
                        id: "add-to-playlist",
                        label: "Add to Playlist…",
                        separatorBefore: true,
                        onSelect: () => setAddToPlaylistTrackId(track.id),
                      },
                    ]}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AddToPlaylistDialog
        open={addToPlaylistTrackId !== null}
        trackId={addToPlaylistTrackId}
        onClose={() => setAddToPlaylistTrackId(null)}
      />
    </div>
  );
}
