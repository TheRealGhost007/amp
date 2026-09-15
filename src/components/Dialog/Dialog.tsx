import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "../Button/Button";
import { Icon } from "../Icon/Icon";
import "./Dialog.css";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Dialog({ open, onClose, title, children, footer }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.[0]?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="op-dialog-backdrop" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="op-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="op-dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="op-dialog__header">
          <h2 id="op-dialog-title" className="op-dialog__title">
            {title}
          </h2>
          <Button variant="ghost" size="sm" iconOnly aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </Button>
        </div>
        <div className="op-dialog__body">{children}</div>
        {footer && <div className="op-dialog__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
