import { MotionConfig } from "framer-motion";
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
