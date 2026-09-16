import { MotionConfig } from "framer-motion";
import { useEffect } from "react";
import { ToastProvider } from "./components";
import { LibraryProvider } from "./context/LibraryContext";
import { applyStoredAudioPreferences } from "./lib/audioPreferences";
import { Shell } from "./shell/Shell";
import { useFavoritesStore } from "./store/favoritesStore";
import { useKeyboardShortcutsStore } from "./store/keyboardShortcutsStore";
import { usePlaybackStore } from "./store/playbackStore";
import { usePlaylistsStore } from "./store/playlistsStore";
import { useQueueStore } from "./store/queueStore";

function App() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    // Queue/playlists/favorites init can all run independently of the
    // playback store's own status/event-listener setup. They load
    // app-wide (not just on their own views) since track context menus
    // everywhere need favorite status and the playlist list.
    void useQueueStore.getState().init();
    void usePlaylistsStore.getState().init();
    void useFavoritesStore.getState().init();
    void useKeyboardShortcutsStore.getState().init();
    void applyStoredAudioPreferences();
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
