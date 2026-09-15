import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface TrackRef {
  id: number;
  uri: string;
}

export interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
}

export type PlaybackState = "Stopped" | "Playing" | "Paused" | "Buffering";

export type PlayerEvent =
  | { type: "StateChanged"; data: PlaybackState }
  | { type: "TrackAdvanced" }
  | { type: "PlaybackFinished" }
  | { type: "Error"; data: string }
  | { type: "OutputDevicesChanged"; data: AudioDevice[] };

export interface PlayerStatus {
  current_track: TrackRef | null;
  is_playing: boolean;
  position_ms: number | null;
  duration_ms: number | null;
}

export interface PlayerPosition {
  position_ms: number | null;
  duration_ms: number | null;
}

/** Every Tauri command this app exposes, in one place — call sites
 * import from here rather than calling `invoke` directly, so a renamed
 * or reshaped command only needs updating once. */
export const player = {
  status: () => invoke<PlayerStatus>("player_status"),
  playNow: (track: TrackRef) => invoke<void>("player_play_now", { track }),
  pause: () => invoke<void>("player_pause"),
  resume: () => invoke<void>("player_resume"),
  stop: () => invoke<void>("player_stop"),
  seek: (positionMs: number) => invoke<void>("player_seek", { positionMs }),
  setNext: (track: TrackRef | null) => invoke<void>("player_set_next", { track }),
  setVolume: (volume: number) => invoke<void>("player_set_volume", { volume }),
  setMuted: (muted: boolean) => invoke<void>("player_set_muted", { muted }),
  setEqBand: (band: number, gainDb: number) =>
    invoke<void>("player_set_eq_band", { band, gainDb }),
  setPlaybackSpeed: (rate: number) => invoke<void>("player_set_playback_speed", { rate }),
  setCrossfadeDuration: (durationMs: number | null) =>
    invoke<void>("player_set_crossfade_duration", { durationMs }),
  listDevices: () => invoke<AudioDevice[]>("player_list_devices"),
  setDevice: (deviceId: string | null) => invoke<void>("player_set_device", { deviceId }),
};

export const settings = {
  get: <T>(key: string) => invoke<T | null>("get_setting", { key }),
  set: <T>(key: string, value: T) => invoke<void>("set_setting", { key, value }),
};

export function onPlayerEvent(
  handler: (event: PlayerEvent) => void,
): Promise<UnlistenFn> {
  return listen<PlayerEvent>("player-event", (e) => handler(e.payload));
}

export function onPlayerPosition(
  handler: (position: PlayerPosition) => void,
): Promise<UnlistenFn> {
  return listen<PlayerPosition>("player-position", (e) => handler(e.payload));
}
