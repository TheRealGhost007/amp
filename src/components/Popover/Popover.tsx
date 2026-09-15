import { ReactNode, RefObject, useEffect, useLayoutEffect, useState } from "react";
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

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const top = placement === "bottom-start" ? rect.bottom + 4 : undefined;
    const bottom =
      placement === "top-start" ? window.innerHeight - rect.top + 4 : undefined;
    setStyle({
      position: "fixed",
      top,
      bottom,
      left: Math.min(rect.left, window.innerWidth - 240),
    });
  }, [open, anchorRef, placement]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (anchorRef.current?.contains(e.target as Node)) return;
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
    <div className="op-popover" style={style}>
      {children}
    </div>,
    document.body,
  );
}
