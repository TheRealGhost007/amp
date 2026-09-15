import { useEffect, useState } from "react";
import { Dropdown } from "../components";
import { applyTheme, type ThemeMode } from "../lib/theme";
import { settings } from "../lib/ipc";
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

const UPCOMING_SECTIONS = [
  { title: "Playback", note: "Crossfade, replay gain, gapless playback controls." },
  { title: "Library", note: "Music folders, automatic scanning, rescan controls." },
  { title: "Audio", note: "Output device and equalizer controls." },
  { title: "Keyboard", note: "Shortcut customization and Vim mode." },
  { title: "Notifications", note: "Track-change notification behavior." },
  { title: "Advanced", note: "Cache management, database tools, logs, debug mode." },
];

export function Settings() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");

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
  }, []);

  function handleThemeChange(value: string) {
    const mode = value as ThemeMode;
    setThemeMode(mode);
    applyTheme(mode);
    settings.set(THEME_SETTING_KEY, mode).catch(() => {});
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

      {UPCOMING_SECTIONS.map((section) => (
        <section
          key={section.title}
          className="op-settings-section op-settings-section--upcoming"
        >
          <h2 className="op-settings-section__title">{section.title}</h2>
          <p className="op-settings-section__note">
            {section.note} Arrives in a later phase.
          </p>
        </section>
      ))}
    </div>
  );
}
