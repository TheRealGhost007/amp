import { motion } from "framer-motion";
import { useEffect } from "react";
import { Artwork, Button, Icon, Slider } from "../components";
import { formatDuration } from "../lib/format";
import { usePlaybackStore } from "../store/playbackStore";
import { useNowPlaying } from "./useNowPlaying";
import "./FullPlayer.css";

interface FullPlayerProps {
  onClose: () => void;
  onOpenQueue: () => void;
}

export function FullPlayer({ onClose, onOpenQueue }: FullPlayerProps) {
  const { track, hasNext, hasPrevious, playNext, playPrevious } = useNowPlaying();
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const positionMs = usePlaybackStore((s) => s.positionMs);
  const durationMs = usePlaybackStore((s) => s.durationMs);
  const volume = usePlaybackStore((s) => s.volume);
  const isFavorite = usePlaybackStore((s) => s.isFavorite);
  const togglePlayPause = usePlaybackStore((s) => s.togglePlayPause);
  const seek = usePlaybackStore((s) => s.seek);
  const setVolume = usePlaybackStore((s) => s.setVolume);
  const toggleFavorite = usePlaybackStore((s) => s.toggleFavorite);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const artworkSeed = track
    ? `${track.artist_name ?? "Unknown Artist"} — ${track.album_title ?? track.title}`
    : "empty";

  return (
    <motion.div
      className="op-full-player"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing"
    >
      <div className="op-full-player__header">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <Icon name="chevron-down" size={16} />
          Minimize
        </Button>
        <Button
          variant="ghost"
          iconOnly
          size="sm"
          aria-label="Open queue"
          onClick={onOpenQueue}
        >
          <Icon name="queue" size={16} />
        </Button>
      </div>

      <div className="op-full-player__body">
        <motion.div layoutId="now-playing-artwork" className="op-full-player__artwork">
          <Artwork seed={artworkSeed} alt="" size={360} />
        </motion.div>

        <div className="op-full-player__meta">
          <h1 className="op-full-player__title">{track?.title ?? "Nothing playing"}</h1>
          <p className="op-full-player__subtitle">
            {track?.artist_name ?? "—"}
            {track?.album_title ? ` · ${track.album_title}` : ""}
          </p>
        </div>

        <div className="op-full-player__progress">
          <Slider
            label="Playback progress"
            min={0}
            max={durationMs ?? 0}
            value={positionMs}
            disabled={!track || !durationMs}
            onChange={(e) => seek(Number(e.target.value))}
          />
          <div className="op-full-player__times">
            <span>{formatDuration(positionMs)}</span>
            <span>-{formatDuration(Math.max(0, (durationMs ?? 0) - positionMs))}</span>
          </div>
        </div>

        <div className="op-full-player__transport">
          <span
            role="button"
            tabIndex={track ? 0 : -1}
            className="op-full-player__favorite"
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={isFavorite}
            onClick={() => track && toggleFavorite()}
            onKeyDown={(e) => {
              if (track && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                toggleFavorite();
              }
            }}
          >
            <Icon name={isFavorite ? "heart-filled" : "heart"} size={20} />
          </span>

          <Button
            variant="ghost"
            iconOnly
            aria-label="Previous"
            disabled={!hasPrevious}
            onClick={playPrevious}
          >
            <Icon name="previous" size={20} />
          </Button>
          <Button
            variant="primary"
            iconOnly
            aria-label={isPlaying ? "Pause" : "Play"}
            disabled={!track}
            onClick={() => togglePlayPause()}
          >
            <Icon name={isPlaying ? "pause" : "play"} size={22} />
          </Button>
          <Button
            variant="ghost"
            iconOnly
            aria-label="Next"
            disabled={!hasNext}
            onClick={playNext}
          >
            <Icon name="next" size={20} />
          </Button>

          <div className="op-full-player__volume">
            <Icon name="volume" size={18} />
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
      </div>
    </motion.div>
  );
}
