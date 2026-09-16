import { MotionConfig } from "framer-motion";
import { useEffect } from "react";
import { ToastProvider } from "./components";
import { LibraryProvider } from "./context/LibraryContext";
import { Shell } from "./shell/Shell";
import { usePlaybackStore } from "./store/playbackStore";
import { usePlaylistsStore } from "./store/playlistsStore";
import { useQueueStore } from "./store/queueStore";

function App() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    // Queue/playlists init can run independently of the playback store's
    // own status/event-listener setup — neither depends on the other.
    // Playlists load app-wide (not just on the Playlists view) since the
    // Library row menu's "Add to Playlist" flow needs the list too.
    void useQueueStore.getState().init();
    void usePlaylistsStore.getState().init();
    usePlaybackStore
      .getState()
      .init()
      .then((unlisten) => {
        cleanup = unlisten;
      });
    return () => cleanup?.();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <LibraryProvider>
          <Shell />
        </LibraryProvider>
      </ToastProvider>
    </MotionConfig>
  );
}

export default App;
