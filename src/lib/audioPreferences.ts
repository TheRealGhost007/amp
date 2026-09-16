import { player, settings } from "./ipc";

/** Persisted `audio_engine::Player` preferences (Settings > Audio and
 * Playback, spec §23) — applied once at app startup (`App.tsx`) so a
 * saved output device/EQ curve/crossfade duration survives a restart,
 * and again immediately whenever the user changes one from Settings
 * itself. Kept in one place so "apply on launch" and "apply on change"
 * can never drift apart. */
export const OUTPUT_DEVICE_SETTING_KEY = "audio.output_device_id";
export const EQ_BANDS_SETTING_KEY = "audio.eq_bands";
export const EQ_BAND_COUNT = 10;
export const CROSSFADE_SETTING_KEY = "playback.crossfade_duration_ms";

export async function applyStoredAudioPreferences(): Promise<void> {
  try {
    const deviceId = await settings.get<string>(OUTPUT_DEVICE_SETTING_KEY);
    if (deviceId) await player.setDevice(deviceId);
  } catch {
    // Best-effort: the audio backend can be unavailable (spec §27), and
    // a saved device that's since been unplugged should never block
    // startup.
  }

  try {
    const bands = await settings.get<number[]>(EQ_BANDS_SETTING_KEY);
    if (bands) {
      for (let band = 0; band < bands.length; band++) {
        await player.setEqBand(band, bands[band]);
      }
    }
  } catch {
    // Same reasoning.
  }

  try {
    const crossfadeMs = await settings.get<number | null>(CROSSFADE_SETTING_KEY);
    if (crossfadeMs) await player.setCrossfadeDuration(crossfadeMs);
  } catch {
    // Same reasoning.
  }
}
