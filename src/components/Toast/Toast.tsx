import { createContext, ReactNode, useCallback, useContext, useState } from "react";
import { createPortal } from "react-dom";
import "./Toast.css";

interface ToastItem {
  id: number;
  message: string;
  variant: "info" | "success" | "danger";
}

interface ToastContextValue {
  show: (message: string, variant?: ToastItem["variant"]) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_AFTER_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback<ToastContextValue["show"]>((message, variant = "info") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, variant }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, DISMISS_AFTER_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {createPortal(
        <div className="op-toast-viewport" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`op-toast op-toast--${toast.variant}`}>
              {toast.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- provider + its hook are one cohesive unit; splitting them into separate files for HMR only would hurt readability for no production benefit.
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
