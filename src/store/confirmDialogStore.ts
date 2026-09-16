import { create } from "zustand";

interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface ConfirmDialogStore {
  request: ConfirmRequest | null;
  confirm: (request: ConfirmRequest) => void;
  close: () => void;
}

/** One global confirmation dialog (spec §27/§40: destructive actions
 * need a confirmation step), mounted once (`Shell.tsx`) and triggered
 * from anywhere — playlist deletion, "Remove From Library" from a track
 * context menu, and any future destructive action — rather than each
 * call site owning its own `<ConfirmDialog>` instance and open-state. */
export const useConfirmDialogStore = create<ConfirmDialogStore>((set) => ({
  request: null,
  confirm: (request) => set({ request }),
  close: () => set({ request: null }),
}));
