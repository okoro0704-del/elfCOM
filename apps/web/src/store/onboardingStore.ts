import { create } from "zustand";

const STORAGE_KEY = "elfcom.onboarding.v1";

export type OnboardingFlags = {
  /** ElfChat identity (personal profile) done — this alone finishes onboarding. */
  elfChat: boolean;
  /** ElfMail address provisioned (optional). */
  elfMail: boolean;
  /** OmniChat channel connected or skipped (optional). */
  omniChat: boolean;
  /** OmniMail mailbox connected or skipped (optional). */
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
  /** ElfChat alone is enough to enter the app. */
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
  isComplete: () => Boolean(get().flags.elfChat),
  needsOnboarding: () => !get().isComplete(),
}));
