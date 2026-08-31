import { create } from "zustand";

const STORAGE_KEY = "elfcom.onboarding.v1";

export type OnboardingFlags = {
  /** ElfChat identity (personal profile) done */
  elfChat: boolean;
  /** ElfMail address provisioned */
  elfMail: boolean;
  /** At least one OmniChat channel connected, or explicitly skipped */
  omniChat: boolean;
  /** At least one OmniMail mailbox connected, or explicitly skipped */
  omniMail: boolean;
};

const defaults: OnboardingFlags = {
  elfChat: false,
  elfMail: false,
  omniChat: false,
  omniMail: false,
};

function read(ownerTrustId: string): OnboardingFlags {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as { ownerTrustId?: string } & OnboardingFlags;
    if (parsed.ownerTrustId !== ownerTrustId) return { ...defaults };
    return {
      elfChat: Boolean(parsed.elfChat),
      elfMail: Boolean(parsed.elfMail),
      omniChat: Boolean(parsed.omniChat),
      omniMail: Boolean(parsed.omniMail),
    };
  } catch {
    return { ...defaults };
  }
}

function write(ownerTrustId: string, flags: OnboardingFlags) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ownerTrustId, ...flags }));
  } catch {
    /* ignore */
  }
}

type OnboardingState = {
  ownerTrustId: string | null;
  flags: OnboardingFlags;
  hydrate: (ownerTrustId: string) => void;
  mark: (key: keyof OnboardingFlags, value?: boolean) => void;
  isComplete: () => boolean;
  needsOnboarding: () => boolean;
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  ownerTrustId: null,
  flags: { ...defaults },
  hydrate: (ownerTrustId) => {
    set({ ownerTrustId, flags: read(ownerTrustId) });
  },
  mark: (key, value = true) => {
    const { ownerTrustId, flags } = get();
    if (!ownerTrustId) return;
    const next = { ...flags, [key]: value };
    write(ownerTrustId, next);
    set({ flags: next });
  },
  isComplete: () => {
    const { flags } = get();
    return flags.elfChat && flags.elfMail && flags.omniChat && flags.omniMail;
  },
  needsOnboarding: () => !get().isComplete(),
}));
