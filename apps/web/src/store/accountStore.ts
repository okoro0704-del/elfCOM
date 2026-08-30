import { create } from "zustand";
import {
  loadProfileManager,
  type ElfAccountContext,
  type ProfileMode,
  type ProfileSetupInput,
  type ProfileManager,
} from "@elfcom/core";

type AccountState = {
  manager: ProfileManager | null;
  context: ElfAccountContext | null;
  hydrate: (ownerTrustId: string) => void;
  switchMode: (mode: ProfileMode) => void;
  completeSetup: (mode: ProfileMode, input: ProfileSetupInput) => void;
  activeMode: () => ProfileMode;
};

export const useAccountStore = create<AccountState>((set, get) => ({
  manager: null,
  context: null,
  hydrate: (ownerTrustId) => {
    const manager = loadProfileManager(ownerTrustId);
    set({ manager, context: manager.getContext() });
  },
  switchMode: (mode) => {
    const { manager } = get();
    if (!manager) return;
    set({ context: manager.switchMode(mode) });
  },
  completeSetup: (mode, input) => {
    const { manager } = get();
    if (!manager) return;
    set({ context: manager.completeSetup(mode, input) });
  },
  activeMode: () => get().context?.activeMode ?? "PERSONAL",
}));
