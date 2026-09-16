import { useEffect, useState } from "react";
import { Button, useToast } from "../components";
import {
  SHORTCUT_DEFS,
  normalizeKeyCombo,
  type ShortcutDef,
  type ShortcutId,
} from "../keyboard/shortcuts";
import { useKeyboardShortcutsStore } from "../store/keyboardShortcutsStore";
import "./KeyboardShortcutsSettings.css";

const CATEGORY_ORDER: ShortcutDef["category"][] = ["Playback", "Navigation", "General"];

/** Renders a normalized combo string (`"Ctrl+K"`, `"ArrowLeft"`,
 * `"Space"`) as one `<kbd>` chip per key — matching how every OS's own
 * shortcut-editor UI displays bindings. */
function ComboDisplay({ combo }: { combo: string }) {
  return (
    <span className="op-shortcut-combo">
      {combo.split("+").map((part, i) => (
        <kbd key={i} className="op-shortcut-combo__key">
          {part}
        </kbd>
      ))}
    </span>
  );
}

function ShortcutRow({ def }: { def: ShortcutDef }) {
  const combo = useKeyboardShortcutsStore((s) => s.bindings[def.id]);
  const rebind = useKeyboardShortcutsStore((s) => s.rebind);
  const resetToDefault = useKeyboardShortcutsStore((s) => s.resetToDefault);
  const bindings = useKeyboardShortcutsStore((s) => s.bindings);
  const [listening, setListening] = useState(false);
  const { show } = useToast();

  useEffect(() => {
    if (!listening) return;

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      // A bare modifier press isn't a complete combo yet — wait for the
      // real key that completes it.
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
      if (e.key === "Escape") {
        setListening(false);
        return;
      }

      const newCombo = normalizeKeyCombo(e);
      const conflictingId = (Object.keys(bindings) as ShortcutId[]).find(
        (id) => id !== def.id && bindings[id] === newCombo,
      );
      if (conflictingId) {
        const conflict = SHORTCUT_DEFS.find((d) => d.id === conflictingId);
        show(
          `"${newCombo}" is already bound to ${conflict?.label ?? conflictingId}`,
          "danger",
        );
      } else {
        rebind(def.id, newCombo);
      }
      setListening(false);
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [listening, bindings, def.id, rebind, show]);

  return (
    <div className="op-shortcut-row">
      <span className="op-shortcut-row__label">{def.label}</span>
      <div className="op-shortcut-row__controls">
        {listening ? (
          <span className="op-shortcut-combo op-shortcut-combo--listening">
            Press a key…
          </span>
        ) : (
          <ComboDisplay combo={combo} />
        )}
        <Button variant="ghost" size="sm" onClick={() => setListening(true)}>
          Change
        </Button>
        {combo !== def.defaultBinding && (
          <Button variant="ghost" size="sm" onClick={() => resetToDefault(def.id)}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}

/** Settings > Keyboard (spec §14/§23): every shortcut listed with its
 * current binding and a click-to-rebind control, backed by
 * `keyboardShortcutsStore`. Grouped by category rather than declaration
 * order so Playback/Navigation/General read as intentional sections. */
export function KeyboardShortcutsSettings() {
  const resetAllToDefaults = useKeyboardShortcutsStore((s) => s.resetAllToDefaults);

  return (
    <div className="op-keyboard-settings">
      {CATEGORY_ORDER.map((category) => (
        <div key={category} className="op-keyboard-settings__group">
          <h3 className="op-keyboard-settings__group-title">{category}</h3>
          {SHORTCUT_DEFS.filter((def) => def.category === category).map((def) => (
            <ShortcutRow key={def.id} def={def} />
          ))}
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={resetAllToDefaults}>
        Reset all to defaults
      </Button>
    </div>
  );
}
