import { motion } from "framer-motion";
import { Artwork, Button, Icon, Slider } from "../components";
import { formatDuration } from "../lib/format";
import { usePlaybackStore } from "../store/playbackStore";
import { useNowPlaying } from "./useNowPlaying";
import "./MiniPlayer.css";

interface MiniPlayerProps {
  onExpand: () => void;
}

export function MiniPlayer({ onExpand }: MiniPlayerProps) {
  const { track, hasNext, hasPrevious, playNext, playPrevious } = useNowPlaying();
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const positionMs = usePlaybackStore((s) => s.positionMs);
  const durationMs = usePlaybackStore((s) => s.durationMs);
  const volume = usePlaybackStore((s) => s.volume);
  const isFavorite = usePlaybackStore((s) => s.isFavorite);
  const audioUnavailable = usePlaybackStore((s) => s.audioUnavailable);
  const togglePlayPause = usePlaybackStore((s) => s.togglePlayPause);
  const seek = usePlaybackStore((s) => s.seek);
  const setVolume = usePlaybackStore((s) => s.setVolume);
  const toggleFavorite = usePlaybackStore((s) => s.toggleFavorite);

  const artworkSeed = track
    ? `${track.artist_name ?? "Unknown Artist"} — ${track.album_title ?? track.title}`
    : "empty";

  return (
    <div className="op-mini-player">
      <button
        className="op-mini-player__identity"
        onClick={onExpand}
        disabled={!track}
        aria-label={track ? "Expand player" : "Nothing playing"}
      >
        <motion.div layoutId="now-playing-artwork">
          <Artwork seed={artworkSeed} alt="" size={44} />
        </motion.div>
        <span className="op-mini-player__text">
          <span className="op-mini-player__title">
            {track?.title ?? "Nothing playing"}
          </span>
          <span className="op-mini-player__subtitle">
            {track?.artist_name ?? (audioUnavailable ? "Audio unavailable" : "—")}
          </span>
        </span>
      </button>

      <div className="op-mini-player__transport">
        <div className="op-mini-player__buttons">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Previous"
            disabled={!hasPrevious}
            onClick={playPrevious}
          >
            <Icon name="previous" size={16} />
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconOnly
            aria-label={isPlaying ? "Pause" : "Play"}
            disabled={!track}
            onClick={() => togglePlayPause()}
          >
            <Icon name={isPlaying ? "pause" : "play"} size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Next"
            disabled={!hasNext}
            onClick={playNext}
          >
            <Icon name="next" size={16} />
          </Button>
        </div>
        <div className="op-mini-player__progress">
          <span className="op-mini-player__time">{formatDuration(positionMs)}</span>
          <Slider
            label="Playback progress"
            min={0}
            max={durationMs ?? 0}
            value={positionMs}
            disabled={!track || !durationMs}
            onChange={(e) => seek(Number(e.target.value))}
          />
          <span className="op-mini-player__time">
            -{formatDuration(Math.max(0, (durationMs ?? 0) - positionMs))}
          </span>
        </div>
      </div>

      <div className="op-mini-player__aside">
        <span
          role="button"
          tabIndex={track ? 0 : -1}
          className="op-mini-player__favorite"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={isFavorite}
          aria-disabled={!track}
          onClick={() => track && toggleFavorite()}
          onKeyDown={(e) => {
            if (track && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              toggleFavorite();
            }
          }}
        >
          <Icon name={isFavorite ? "heart-filled" : "heart"} size={16} />
        </span>
        <Icon name="volume" size={16} />
        <Slider
          label="Volume"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
