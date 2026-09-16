import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface TrackRef {
  id: number;
  uri: string;
}

/** Converts an absolute filesystem path to a `file://` URI, percent-
 * encoding each path segment individually — a bare `encodeURI` would
 * leave characters like `#` and `?` unescaped, which GStreamer would
 * then misparse as a URI fragment/query rather than part of the path. */
export function pathToFileUri(path: string): string {
  const segments = path.split("/").map(encodeURIComponent);
  return `file://${segments.join("/")}`;
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

export interface TrackListItem {
  id: number;
  path: string;
  title: string;
  artist_name: string | null;
  album_title: string | null;
  genre_name: string | null;
  track_number: number | null;
  disc_number: number | null;
  duration_ms: number;
  year: number | null;
  has_embedded_art: boolean;
  added_at: number;
}

export interface AlbumSummary {
  id: number;
  title: string;
  artist_name: string | null;
  year: number | null;
  track_count: number;
}

export interface ArtistSummary {
  id: number;
  name: string;
  album_count: number;
  track_count: number;
}

export interface QueueTrackItem {
  id: number;
  track: TrackListItem;
}

export interface PlaylistSummary {
  id: number;
  name: string;
  description: string | null;
  track_count: number;
}

export interface Playlist {
  id: number;
  name: string;
  description: string | null;
  artwork_path: string | null;
  created_at: number;
  updated_at: number;
}

export interface PlaylistTrackItem {
  id: number;
  track: TrackListItem;
}

export interface ScanFileError {
  path: string;
  message: string;
}

export interface ScanSummary {
  added: number;
  updated: number;
  removed: number;
  renamed: number;
  unchanged: number;
  errors: ScanFileError[];
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

/** `invoke`'s return type is a compile-time assertion, not a runtime
 * guarantee — an IPC boundary is worth defending like any other
 * untrusted input (spec §37), so a malformed/missing list response
 * degrades to empty rather than crashing every list/grid view that
 * calls `.length` on it. */
async function listOrEmpty<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T[]> {
  const result = await invoke<T[]>(command, args);
  return Array.isArray(result) ? result : [];
}

export const library = {
  addFolder: (path: string) => invoke<ScanSummary>("library_add_folder", { path }),
  listScanRoots: () => listOrEmpty<string>("library_list_scan_roots"),
  removeScanRoot: (path: string) => invoke<void>("library_remove_scan_root", { path }),
  listTracks: () => listOrEmpty<TrackListItem>("library_list_tracks"),
  listAlbums: () => listOrEmpty<AlbumSummary>("library_list_albums"),
  listArtists: () => listOrEmpty<ArtistSummary>("library_list_artists"),
  search: (query: string) => listOrEmpty<TrackListItem>("library_search", { query }),
};

export const favorites = {
  isFavorite: (trackId: number) => invoke<boolean>("favorites_is_favorite", { trackId }),
  toggle: (trackId: number) => invoke<boolean>("favorites_toggle", { trackId }),
  listIds: () => listOrEmpty<number>("favorites_list_ids"),
};

export const queue = {
  list: () => listOrEmpty<QueueTrackItem>("queue_list"),
  add: (trackId: number) => invoke<number>("queue_add", { trackId }),
  playNext: (trackId: number) => invoke<number>("queue_play_next", { trackId }),
  remove: (queueItemId: number) => invoke<void>("queue_remove", { queueItemId }),
  reorder: (queueItemIds: number[]) => invoke<void>("queue_reorder", { queueItemIds }),
  clear: () => invoke<void>("queue_clear"),
};

export const playlists = {
  list: () => listOrEmpty<PlaylistSummary>("playlists_list"),
  create: (name: string) => invoke<Playlist>("playlists_create", { name }),
  rename: (playlistId: number, name: string) =>
    invoke<void>("playlists_rename", { playlistId, name }),
  setDescription: (playlistId: number, description: string | null) =>
    invoke<void>("playlists_set_description", { playlistId, description }),
  delete: (playlistId: number) => invoke<void>("playlists_delete", { playlistId }),
  listTracks: (playlistId: number) =>
    listOrEmpty<PlaylistTrackItem>("playlists_list_tracks", { playlistId }),
  addTrack: (playlistId: number, trackId: number) =>
    invoke<number>("playlists_add_track", { playlistId, trackId }),
  removeTrack: (playlistTrackId: number) =>
    invoke<void>("playlists_remove_track", { playlistTrackId }),
  reorderTracks: (playlistId: number, playlistTrackIds: number[]) =>
    invoke<void>("playlists_reorder_tracks", { playlistId, playlistTrackIds }),
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
