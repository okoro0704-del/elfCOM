import { create } from "zustand";

const STORAGE_KEY = "elfcom.trustid.session";

export type TrustIdSession = {
  accessToken: string;
  trustId: string;
  sid?: string;
  expiresAt?: string;
};

type AuthState = {
  session: TrustIdSession | null;
  hydrated: boolean;
  hydrate: () => void;
  setSession: (result: {
    accessToken: string;
    trustId: string;
    sid?: string;
    expiresAt?: string;
  }) => void;
  clearSession: () => void;
  isAuthenticated: () => boolean;
};

function readStored(): TrustIdSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TrustIdSession;
    if (!parsed?.accessToken || !parsed?.trustId) return null;
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) < Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  hydrated: false,
  hydrate: () => {
    set({ session: readStored(), hydrated: true });
  },
  setSession: (result) => {
    const session: TrustIdSession = {
      accessToken: result.accessToken,
      trustId: result.trustId,
      sid: result.sid,
      expiresAt: result.expiresAt,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    set({ session, hydrated: true });
  },
  clearSession: () => {
    sessionStorage.removeItem(STORAGE_KEY);
    set({ session: null });
  },
  isAuthenticated: () => Boolean(get().session?.accessToken),
}));
