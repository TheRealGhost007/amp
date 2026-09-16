import { useEffect, useState } from "react";
import { Slider, Toggle } from "../components";
import { CROSSFADE_SETTING_KEY } from "../lib/audioPreferences";
import { player, settings } from "../lib/ipc";
import "./PlaybackSettings.css";

const DEFAULT_CROSSFADE_MS = 3000;
const MIN_CROSSFADE_MS = 1000;
const MAX_CROSSFADE_MS = 12000;

/** Settings > Playback (spec §23): crossfade, the one playback-engine
 * knob (`audio_engine::Player::set_crossfade_duration`, real since
 * Phase 4) that had no UI. Gapless is the default with crossfade off
 * (`duration_ms: null`) — matches the backend's own default. */
export function PlaybackSettings() {
  const [enabled, setEnabled] = useState(false);
  const [durationMs, setDurationMs] = useState(DEFAULT_CROSSFADE_MS);

  useEffect(() => {
    settings
      .get<number | null>(CROSSFADE_SETTING_KEY)
      .then((saved) => {
        if (saved) {
          setEnabled(true);
          setDurationMs(saved);
        }
      })
      .catch(() => {});
  }, []);

  function apply(nextEnabled: boolean, nextDurationMs: number) {
    player.setCrossfadeDuration(nextEnabled ? nextDurationMs : null).catch(() => {});
    settings
      .set(CROSSFADE_SETTING_KEY, nextEnabled ? nextDurationMs : null)
      .catch(() => {});
  }

  function handleToggle(checked: boolean) {
    setEnabled(checked);
    apply(checked, durationMs);
  }

  function handleDurationChange(ms: number) {
    setDurationMs(ms);
    apply(enabled, ms);
  }

  return (
    <div className="op-playback-settings">
      <Toggle
        label="Crossfade"
        hint="Blends the end of one track into the start of the next. Off means gapless playback instead."
        checked={enabled}
        onChange={handleToggle}
      />
      {enabled && (
        <div className="op-playback-settings__duration">
          <Slider
            label="Crossfade duration"
            min={MIN_CROSSFADE_MS}
            max={MAX_CROSSFADE_MS}
            step={500}
            value={durationMs}
            onChange={(e) => handleDurationChange(Number(e.target.value))}
          />
          <span className="op-playback-settings__duration-value">
            {(durationMs / 1000).toFixed(1)}s
          </span>
        </div>
      )}
    </div>
  );
}
