import { useEffect, useState } from "react";
import { Dropdown, Toggle } from "../components";
import { applyTheme, type ThemeMode } from "../lib/theme";
import { settings } from "../lib/ipc";
import { AudioSettings } from "./AudioSettings";
import { KeyboardShortcutsSettings } from "./KeyboardShortcutsSettings";
import { LibrarySettings } from "./LibrarySettings";
import { PlaybackSettings } from "./PlaybackSettings";
import { ViewHeader } from "./ViewHeader";
import "./views.css";
import "./Settings.css";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "Match system" },
  { value: "omarchy-dark", label: "Omarchy Dark" },
  { value: "omarchy-light", label: "Omarchy Light" },
  { value: "amoled-dark", label: "AMOLED Dark" },
];

const THEME_SETTING_KEY = "appearance.theme_mode";
/** Mirrors `src-tauri::mpris::NOTIFICATIONS_SETTING_KEY` — the Rust tick
 * loop reads this same key before firing a track-change notification. */
const NOTIFICATIONS_SETTING_KEY = "notifications.track_change_enabled";

const UPCOMING_SECTIONS = [
  {
    title: "Advanced",
    note: "Cache management, database tools, logs, debug mode — no backend support for any of these yet (nothing to clear/inspect/toggle).",
  },
];

export function Settings() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [notifyOnTrackChange, setNotifyOnTrackChange] = useState(true);

  useEffect(() => {
    settings
      .get<ThemeMode>(THEME_SETTING_KEY)
      .then((saved) => {
        if (saved) {
          setThemeMode(saved);
          applyTheme(saved);
        }
      })
      .catch(() => {
        // Settings persistence is best-effort in the UI: falling back to
        // the in-memory default is preferable to blocking the view.
      });
    settings
      .get<boolean>(NOTIFICATIONS_SETTING_KEY)
      .then((saved) => {
        if (saved !== null) setNotifyOnTrackChange(saved);
      })
      .catch(() => {});
  }, []);

  function handleThemeChange(value: string) {
    const mode = value as ThemeMode;
    setThemeMode(mode);
    applyTheme(mode);
    settings.set(THEME_SETTING_KEY, mode).catch(() => {});
  }

  function handleNotifyOnTrackChangeChange(checked: boolean) {
    setNotifyOnTrackChange(checked);
    settings.set(NOTIFICATIONS_SETTING_KEY, checked).catch(() => {});
  }

  return (
    <div className="op-view">
      <ViewHeader title="Settings" />

      <section className="op-settings-section">
        <h2 className="op-settings-section__title">Appearance</h2>
        <Dropdown
          label="Theme"
          value={themeMode}
          onChange={handleThemeChange}
          options={THEME_OPTIONS}
        />
      </section>

      <section className="op-settings-section">
        <h2 className="op-settings-section__title">Playback</h2>
        <PlaybackSettings />
      </section>

      <section className="op-settings-section">
        <h2 className="op-settings-section__title">Library</h2>
        <LibrarySettings />
      </section>

      <section className="op-settings-section">
        <h2 className="op-settings-section__title">Audio</h2>
        <AudioSettings />
      </section>

      <section className="op-settings-section">
        <h2 className="op-settings-section__title">Keyboard</h2>
        <KeyboardShortcutsSettings />
      </section>

      <section className="op-settings-section">
        <h2 className="op-settings-section__title">Notifications</h2>
        <Toggle
          label="Notify on track change"
          hint="Shows a desktop notification with artwork whenever a new track starts playing."
          checked={notifyOnTrackChange}
          onChange={handleNotifyOnTrackChangeChange}
        />
      </section>

      {UPCOMING_SECTIONS.map((section) => (
        <section
          key={section.title}
          className="op-settings-section op-settings-section--upcoming"
        >
          <h2 className="op-settings-section__title">{section.title}</h2>
          <p className="op-settings-section__note">{section.note}</p>
        </section>
      ))}
    </div>
  );
}
