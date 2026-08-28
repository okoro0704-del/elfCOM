import { create } from "zustand";

type UiState = {
  /** Hide bottom nav when immersion drawers are open (full chat / composer). */
  hideChrome: boolean;
  setHideChrome: (hide: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  hideChrome: false,
  setHideChrome: (hide) => set({ hideChrome: hide }),
}));
