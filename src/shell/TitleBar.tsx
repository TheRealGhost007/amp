import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "../components";
import "./TitleBar.css";

/** Custom title bar replacing the native OS window chrome (`decorations:
 * false` in `tauri.conf.json`) — the user asked for the window to carry
 * only a close button, not the usual minimize/maximize/close trio.
 * `data-tauri-drag-region` on the bar itself is what makes it draggable;
 * it's a plain HTML attribute the webview shell recognizes directly, no
 * JS wiring needed. The close button sits outside that region (a click
 * there should close the window, not start a drag). */
export function TitleBar() {
  return (
    <div className="op-titlebar" data-tauri-drag-region>
      <span className="op-titlebar__title" data-tauri-drag-region>
        Amp
      </span>
      <button
        type="button"
        className="op-titlebar__close"
        aria-label="Close"
        onClick={() => void getCurrentWindow().close()}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
