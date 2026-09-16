import {
  ReactNode,
  RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import "./Popover.css";

interface PopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  placement?: "bottom-start" | "top-start";
}

/** Shared positioning + dismissal logic for Menu and Dropdown: portals
 * content next to an anchor element, closes on outside click or Escape,
 * clamps to the viewport. Hand-rolled rather than a floating-ui
 * dependency — this app's popovers are all simple anchor-relative cases. */
export function Popover({
  anchorRef,
  open,
  onClose,
  children,
  placement = "bottom-start",
}: PopoverProps) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !contentRef.current) return;
    const anchorRect = anchorRef.current.getBoundingClientRect();
    // Measured from the actual rendered content rather than assuming a
    // fixed width/height — a menu with longer labels (context menus with
    // many entries) can easily be wider than any one hardcoded guess,
    // and a wrong guess means the real content clips off the viewport
    // edge instead of the clamp doing anything.
    const { width, height } = contentRef.current.getBoundingClientRect();
    const margin = 8;

    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const spaceAbove = anchorRect.top;
    const fitsBelow = spaceBelow >= height + margin;
    const fitsAbove = spaceAbove >= height + margin;
    // Prefer the requested side; flip to the other only if the
    // requested side doesn't fit but the opposite one does.
    const placeBelow =
      placement === "bottom-start" ? fitsBelow || !fitsAbove : !(fitsAbove || !fitsBelow);

    const left = Math.min(
      Math.max(anchorRect.left, margin),
      window.innerWidth - width - margin,
    );

    setStyle({
      position: "fixed",
      top: placeBelow ? anchorRect.bottom + 4 : undefined,
      bottom: placeBelow ? undefined : window.innerHeight - anchorRect.top + 4,
      left,
    });
  }, [open, anchorRef, placement]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      // A click inside the popover's own portaled content (e.g. a menu
      // item) must not count as "outside" — it's rendered into
      // document.body via a portal, so it's never a DOM descendant of
      // anchorRef, and without this check every click inside the
      // popover would close it on pointerdown before the item's own
      // onClick ever ran.
      if (anchorRef.current?.contains(target) || contentRef.current?.contains(target)) {
        return;
      }
      onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, anchorRef, onClose]);

  if (!open) return null;

  return createPortal(
    <div ref={contentRef} className="op-popover" style={style}>
      {children}
    </div>,
    document.body,
  );
}
