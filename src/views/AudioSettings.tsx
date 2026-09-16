import { useEffect, useState } from "react";
import { Dropdown, Slider } from "../components";
import {
  EQ_BAND_COUNT,
  EQ_BANDS_SETTING_KEY,
  OUTPUT_DEVICE_SETTING_KEY,
} from "../lib/audioPreferences";
import { player, settings, type AudioDevice } from "../lib/ipc";
import "./AudioSettings.css";

const SYSTEM_DEFAULT_VALUE = "";

/** Standard 10-band graphic-EQ center frequencies — the same set every
 * consumer EQ (and `audio-engine`'s `equalizer-10bands` GStreamer
 * element) uses, so labeling bands this way reads as a real EQ rather
 * than ten anonymous sliders. */
const BAND_FREQUENCY_LABELS = [
  "31Hz",
  "62Hz",
  "125Hz",
  "250Hz",
  "500Hz",
  "1kHz",
  "2kHz",
  "4kHz",
  "8kHz",
  "16kHz",
];

function flatBands(): number[] {
  return Array(EQ_BAND_COUNT).fill(0);
}

/** Settings > Audio (spec §23): output device selection and the 10-band
 * equalizer — both backed by real `audio_engine::Player` commands since
 * Phase 4, but never reachable from any UI until now. Changes apply
 * immediately (matching every other setting in this app) and persist so
 * `applyStoredAudioPreferences` can restore them on the next launch. */
export function AudioSettings() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [deviceId, setDeviceId] = useState(SYSTEM_DEFAULT_VALUE);
  const [bands, setBands] = useState<number[]>(flatBands);

  useEffect(() => {
    player
      .listDevices()
      .then(setDevices)
      .catch(() => {
        // Audio backend unavailable (spec §27) — the dropdown just shows
        // "System default" with no alternatives, not an error.
      });
    settings
      .get<string>(OUTPUT_DEVICE_SETTING_KEY)
      .then((saved) => {
        if (saved) setDeviceId(saved);
      })
      .catch(() => {});
    settings
      .get<number[]>(EQ_BANDS_SETTING_KEY)
      .then((saved) => {
        if (saved) setBands(saved);
      })
      .catch(() => {});
  }, []);

  function handleDeviceChange(value: string) {
    setDeviceId(value);
    const target = value || null;
    player.setDevice(target).catch(() => {});
    settings.set(OUTPUT_DEVICE_SETTING_KEY, value).catch(() => {});
  }

  function handleBandChange(band: number, gainDb: number) {
    const next = bands.slice();
    next[band] = gainDb;
    setBands(next);
    player.setEqBand(band, gainDb).catch(() => {});
    settings.set(EQ_BANDS_SETTING_KEY, next).catch(() => {});
  }

  function handleResetEq() {
    const next = flatBands();
    setBands(next);
    for (let band = 0; band < next.length; band++) {
      player.setEqBand(band, 0).catch(() => {});
    }
    settings.set(EQ_BANDS_SETTING_KEY, next).catch(() => {});
  }

  return (
    <div className="op-audio-settings">
      <Dropdown
        label="Output device"
        value={deviceId}
        onChange={handleDeviceChange}
        options={[
          { value: SYSTEM_DEFAULT_VALUE, label: "System default" },
          ...devices.map((device) => ({ value: device.id, label: device.name })),
        ]}
      />

      <div className="op-audio-settings__eq-header">
        <span className="op-field__label">Equalizer</span>
        <button
          type="button"
          className="op-audio-settings__eq-reset"
          onClick={handleResetEq}
        >
          Reset
        </button>
      </div>
      <div className="op-audio-settings__eq">
        {BAND_FREQUENCY_LABELS.map((freqLabel, band) => (
          <div key={band} className="op-audio-settings__band">
            <span className="op-audio-settings__band-freq">{freqLabel}</span>
            <Slider
              label={`${freqLabel} gain`}
              min={-24}
              max={12}
              step={1}
              value={bands[band] ?? 0}
              onChange={(e) => handleBandChange(band, Number(e.target.value))}
            />
            <span className="op-audio-settings__band-value">{bands[band] ?? 0}dB</span>
          </div>
        ))}
      </div>
    </div>
  );
}
