import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button, Dropdown, Slider } from "../components";
import { useToast } from "../components/Toast/Toast";
import { settings } from "../lib/ipc";
import {
  BACKGROUND_IMAGE_SETTING_KEY,
  changeTheme,
  CUSTOM_THEME_SETTING_KEY,
  setBackgroundImage,
  THEME_SETTING_KEY,
  type CustomThemeConfig,
  type ThemeMode,
} from "../lib/theme";
import "./AppearanceSettings.css";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "Match system" },
  { value: "omarchy-dark", label: "Omarchy Dark" },
  { value: "omarchy-light", label: "Omarchy Light" },
  { value: "amoled-dark", label: "AMOLED Dark" },
  { value: "custom", label: "Custom" },
];

const BASE_OPTIONS = [
  { value: "omarchy-dark", label: "Dark" },
  { value: "omarchy-light", label: "Light" },
];

const DEFAULT_CUSTOM_CONFIG: CustomThemeConfig = {
  base: "omarchy-dark",
  gradientFrom: "#1a1a2e",
  gradientTo: "#e68e0d",
  angle: 135,
  accent: "#e68e0d",
};

/** Settings > Appearance (spec §24): theme mode, a custom
 * gradient-and-accent theme, and an independent custom background image
 * — separated from `Settings.tsx` once this stopped being a single
 * dropdown, matching every other section's own file. */
export function AppearanceSettings() {
  const { show } = useToast();
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [customConfig, setCustomConfig] =
    useState<CustomThemeConfig>(DEFAULT_CUSTOM_CONFIG);
  const [backgroundImagePath, setBackgroundImagePath] = useState<string | null>(null);
  const [backgroundImageBusy, setBackgroundImageBusy] = useState(false);

  useEffect(() => {
    settings
      .get<ThemeMode>(THEME_SETTING_KEY)
      .then((saved) => {
        // App.tsx's own startup init already applied and is watching
        // this — this effect only needs the value to show the controls
        // in the right state, not to re-apply it.
        if (saved) setThemeMode(saved);
      })
      .catch(() => {});
    settings
      .get<CustomThemeConfig>(CUSTOM_THEME_SETTING_KEY)
      .then((saved) => {
        if (saved) setCustomConfig(saved);
      })
      .catch(() => {});
    settings
      .get<string>(BACKGROUND_IMAGE_SETTING_KEY)
      .then((saved) => {
        if (saved) setBackgroundImagePath(saved);
      })
      .catch(() => {});
  }, []);

  function handleThemeChange(value: string) {
    const mode = value as ThemeMode;
    setThemeMode(mode);
    changeTheme(mode, mode === "custom" ? customConfig : undefined);
  }

  function handleCustomConfigChange(patch: Partial<CustomThemeConfig>) {
    const next = { ...customConfig, ...patch };
    setCustomConfig(next);
    // Only actually applied while "Custom" is the active mode — editing
    // the color pickers shouldn't silently switch the theme out from
    // under a user who's just previewing/adjusting a saved config.
    if (themeMode === "custom") changeTheme("custom", next);
  }

  async function handlePickBackgroundImage() {
    const selected = await open({
      directory: false,
      multiple: false,
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] },
      ],
    });
    if (!selected || Array.isArray(selected)) return;
    setBackgroundImageBusy(true);
    try {
      await setBackgroundImage(selected);
      setBackgroundImagePath(selected);
    } catch (error) {
      show(error instanceof Error ? error.message : "Couldn't use that image", "danger");
    } finally {
      setBackgroundImageBusy(false);
    }
  }

  async function handleClearBackgroundImage() {
    await setBackgroundImage(null);
    setBackgroundImagePath(null);
  }

  return (
    <div className="op-appearance-settings">
      <Dropdown
        label="Theme"
        value={themeMode}
        onChange={handleThemeChange}
        options={THEME_OPTIONS}
      />

      {themeMode === "custom" && (
        <div className="op-appearance-settings__custom">
          <Dropdown
            label="Base"
            value={customConfig.base}
            onChange={(value) =>
              handleCustomConfigChange({ base: value as CustomThemeConfig["base"] })
            }
            options={BASE_OPTIONS}
          />

          <div className="op-appearance-settings__swatch-row">
            <label className="op-appearance-settings__swatch">
              <span>Gradient start</span>
              <input
                type="color"
                value={customConfig.gradientFrom}
                onChange={(e) =>
                  handleCustomConfigChange({ gradientFrom: e.target.value })
                }
              />
            </label>
            <label className="op-appearance-settings__swatch">
              <span>Gradient end</span>
              <input
                type="color"
                value={customConfig.gradientTo}
                onChange={(e) => handleCustomConfigChange({ gradientTo: e.target.value })}
              />
            </label>
            <label className="op-appearance-settings__swatch">
              <span>Accent</span>
              <input
                type="color"
                value={customConfig.accent}
                onChange={(e) => handleCustomConfigChange({ accent: e.target.value })}
              />
            </label>
          </div>

          <Slider
            label={`Gradient angle: ${customConfig.angle}°`}
            min={0}
            max={360}
            value={customConfig.angle}
            onChange={(e) => handleCustomConfigChange({ angle: Number(e.target.value) })}
          />

          <div
            className="op-appearance-settings__preview"
            style={{
              background: `linear-gradient(${customConfig.angle}deg, ${customConfig.gradientFrom}, ${customConfig.gradientTo})`,
            }}
          />
        </div>
      )}

      <div className="op-appearance-settings__background">
        <span className="op-field__label">Background image</span>
        <p className="op-settings-section__note">
          Shown behind the whole app, under a dark scrim for readability. Combines with
          any theme above.
        </p>
        {backgroundImagePath && (
          <p className="op-appearance-settings__background-path">{backgroundImagePath}</p>
        )}
        <div className="op-appearance-settings__background-actions">
          <Button
            variant="secondary"
            disabled={backgroundImageBusy}
            onClick={() => void handlePickBackgroundImage()}
          >
            {backgroundImagePath ? "Change Image…" : "Choose Image…"}
          </Button>
          {backgroundImagePath && (
            <Button variant="ghost" onClick={() => void handleClearBackgroundImage()}>
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
