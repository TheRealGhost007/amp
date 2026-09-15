import { useEffect } from "react";
import { ToastProvider } from "./components";
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
      <Shell />
    </ToastProvider>
  );
}

export default App;
