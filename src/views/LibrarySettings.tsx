import { useEffect, useState } from "react";
import { Button, Icon } from "../components";
import { useLibrary } from "../context/LibraryContext";
import { library } from "../lib/ipc";
import "./LibrarySettings.css";

/** Settings > Library (spec §23): manage the folders being scanned.
 * `library.listScanRoots`/`removeScanRoot` have existed since Phase 2/3
 * but had no UI to call them from — "Add Folder" (`useLibrary().addFolder`,
 * Phase 6) could only ever grow the list, never shrink it. */
export function LibrarySettings() {
  const { addFolder, refresh } = useLibrary();
  const [roots, setRoots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  function refreshRoots() {
    library
      .listScanRoots()
      .then(setRoots)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refreshRoots();
  }, []);

  async function handleAddFolder() {
    await addFolder();
    refreshRoots();
  }

  async function handleRemove(path: string) {
    await library.removeScanRoot(path);
    refreshRoots();
    void refresh();
  }

  return (
    <div className="op-library-settings">
      {!loading && roots.length === 0 && (
        <p className="op-settings-section__note">No music folders added yet.</p>
      )}
      {roots.length > 0 && (
        <ul className="op-library-settings__roots">
          {roots.map((path) => (
            <li key={path} className="op-library-settings__root">
              <Icon name="folder" size={16} />
              <span className="op-library-settings__root-path">{path}</span>
              <Button variant="ghost" size="sm" onClick={() => void handleRemove(path)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" onClick={() => void handleAddFolder()}>
        Add Folder…
      </Button>
    </div>
  );
}
