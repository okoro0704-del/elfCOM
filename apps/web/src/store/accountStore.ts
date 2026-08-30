import { create } from "zustand";
import {
  loadProfileManager,
  publishDirectoryProfile,
  type ElfAccountContext,
  type ProfileMode,
  type ProfileSetupInput,
  type ProfileManager,
} from "@elfcom/core";
import { useAuthStore } from "./authStore";

type AccountState = {
  manager: ProfileManager | null;
  context: ElfAccountContext | null;
  publishError: string | null;
  hydrate: (ownerTrustId: string) => void;
  switchMode: (mode: ProfileMode) => void;
  completeSetup: (mode: ProfileMode, input: ProfileSetupInput) => Promise<void>;
  needsSetup: (mode?: ProfileMode) => boolean;
  activeMode: () => ProfileMode;
};

function discoveryConfig() {
  return {
    baseUrl: import.meta.env.VITE_ELFCOM_BASE_URL?.trim() || "",
    getAccessToken: () => useAuthStore.getState().session?.accessToken,
  };
}

export const useAccountStore = create<AccountState>((set, get) => ({
  manager: null,
  context: null,
  publishError: null,
  hydrate: (ownerTrustId) => {
    const manager = loadProfileManager(ownerTrustId);
    set({ manager, context: manager.getContext(), publishError: null });
  },
  switchMode: (mode) => {
    const { manager } = get();
    if (!manager) return;
    set({ context: manager.switchMode(mode) });
  },
  completeSetup: async (mode, input) => {
    const { manager } = get();
    if (!manager) throw new Error("Account not hydrated");
    const context = manager.completeSetup(mode, input);
    set({ context, publishError: null });

    const profile = mode === "PERSONAL" ? context.personal : context.business;
    try {
      await publishDirectoryProfile(discoveryConfig(), profile);
    } catch (err) {
      set({
        publishError:
          err instanceof Error
            ? `Saved locally; directory sync failed: ${err.message}`
            : "Saved locally; directory sync failed",
      });
    }
  },
  needsSetup: (mode) => {
    const { manager, context } = get();
    if (!manager || !context) return true;
    return manager.needsSetup(mode ?? context.activeMode);
  },
  activeMode: () => get().context?.activeMode ?? "PERSONAL",
}));
