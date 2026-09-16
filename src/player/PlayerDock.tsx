import { AnimatePresence } from "framer-motion";
import { usePlayerViewStore } from "../store/playerViewStore";
import { FullPlayer } from "./FullPlayer";
import { MiniPlayer } from "./MiniPlayer";

interface PlayerDockProps {
  onOpenQueue: () => void;
}

/** Renders the full-screen player based on `playerViewStore.expanded` —
 * lifted out of local state (Phase 12) so the global keyboard shortcut
 * manager's Escape binding can collapse it from outside this component
 * tree. `usePlaybackStore` remains the only source of truth for track/
 * position/playing state, read identically by both `MiniPlayer` and
 * `FullPlayer` (spec §21). The shared `layoutId="now-playing-artwork"`
 * on each component's artwork is what gives the expand/collapse its
 * shared-element transition. */
export function PlayerDock({ onOpenQueue }: PlayerDockProps) {
  const expanded = usePlayerViewStore((s) => s.expanded);
  const expand = usePlayerViewStore((s) => s.expand);
  const collapse = usePlayerViewStore((s) => s.collapse);

  return (
    <>
      <MiniPlayer onExpand={expand} />
      <AnimatePresence>
        {expanded && (
          <FullPlayer
            onClose={collapse}
            onOpenQueue={() => {
              collapse();
              onOpenQueue();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
