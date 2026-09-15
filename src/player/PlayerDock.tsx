import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { FullPlayer } from "./FullPlayer";
import { MiniPlayer } from "./MiniPlayer";

interface PlayerDockProps {
  onOpenQueue: () => void;
}

/** Owns exactly one piece of state — whether the full-screen player is
 * open — and nothing about playback itself; `usePlaybackStore` remains
 * the only source of truth for track/position/playing state, read
 * identically by both `MiniPlayer` and `FullPlayer` (spec §21). The
 * shared `layoutId="now-playing-artwork"` on each component's artwork
 * is what gives the expand/collapse its shared-element transition. */
export function PlayerDock({ onOpenQueue }: PlayerDockProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <MiniPlayer onExpand={() => setExpanded(true)} />
      <AnimatePresence>
        {expanded && (
          <FullPlayer
            onClose={() => setExpanded(false)}
            onOpenQueue={() => {
              setExpanded(false);
              onOpenQueue();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
