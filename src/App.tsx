import { useEffect } from "react";
import { ToastProvider } from "./components";
import { LibraryProvider } from "./context/LibraryContext";
import { Shell } from "./shell/Shell";
import { usePlaybackStore } from "./store/playbackStore";

function App() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    usePlaybackStore
      .getState()
      .init()
      .then((unlisten) => {
        cleanup = unlisten;
      });
    return () => cleanup?.();
  }, []);

  return (
    <ToastProvider>
      <LibraryProvider>
        <Shell />
      </LibraryProvider>
    </ToastProvider>
  );
}

export default App;
