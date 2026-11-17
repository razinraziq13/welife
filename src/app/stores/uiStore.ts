import { create } from 'zustand';

interface ShortcutsDialogState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** Shared so both the "?" shortcut and the Settings button can open the same dialog. */
export const useShortcutsDialogStore = create<ShortcutsDialogState>()((set) => ({
  open: false,
  setOpen: (open) => {
    set({ open });
  },
}));
