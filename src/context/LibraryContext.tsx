import { open } from "@tauri-apps/plugin-dialog";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  library,
  type AlbumSummary,
  type ArtistSummary,
  type ScanSummary,
  type TrackListItem,
} from "../lib/ipc";

interface LibraryContextValue {
  tracks: TrackListItem[];
  albums: AlbumSummary[];
  artists: ArtistSummary[];
  loading: boolean;
  /** `null` if scanning fails outright (e.g. an unreadable path); a
   * `ScanSummary` — including one where every file errored — otherwise.
   * Distinguishing these lets the caller show "couldn't scan that
   * folder at all" vs. "scanned, but every file had a problem." */
  addFolder: () => Promise<ScanSummary | null>;
  refresh: () => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

async function fetchLibrarySnapshot() {
  const [tracks, albums, artists] = await Promise.all([
    library.listTracks(),
    library.listAlbums(),
    library.listArtists(),
  ]);
  return { tracks, albums, artists };
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<TrackListItem[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  // Starts true so the initial mount fetch below never needs to set it
  // synchronously from inside an effect body (React Compiler's
  // set-state-in-effect rule flags that) — it only needs to clear the
  // flag once loading actually finishes.
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await fetchLibrarySnapshot();
      setTracks(snapshot.tracks);
      setAlbums(snapshot.albums);
      setArtists(snapshot.artists);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchLibrarySnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        setTracks(snapshot.tracks);
        setAlbums(snapshot.albums);
        setArtists(snapshot.artists);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || Array.isArray(selected)) return null;

    const summary = await library.addFolder(selected);
    await refresh();
    return summary;
  }, [refresh]);

  const value = useMemo(
    () => ({ tracks, albums, artists, loading, addFolder, refresh }),
    [tracks, albums, artists, loading, addFolder, refresh],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- provider + its hook are one cohesive unit; splitting them into separate files for HMR only would hurt readability for no production benefit.
export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within a LibraryProvider");
  return ctx;
}
