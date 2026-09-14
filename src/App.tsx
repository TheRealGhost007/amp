import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface EngineVersions {
  player_core: string;
  audio_engine: string;
  linux_integration: string;
}

function App() {
  const [versions, setVersions] = useState<EngineVersions | null>(null);

  useEffect(() => {
    invoke<EngineVersions>("engine_versions").then(setVersions);
  }, []);

  return (
    <main className="app-shell">
      <p>omarchy-player scaffold — design system lands in Phase 1</p>
      {versions && <pre>{JSON.stringify(versions, null, 2)}</pre>}
    </main>
  );
}

export default App;
