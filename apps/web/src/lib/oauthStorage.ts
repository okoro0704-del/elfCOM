/**
 * Persist OAuth PKCE across Capacitor Browser hops (sessionStorage is unreliable).
 */
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const OAUTH_KEY = "elfcom.trustid.oauth";

export type OAuthPkceState = {
  verifier: string;
  state: string;
  redirect: string;
  startedAt: number;
  silent: boolean;
};

export async function saveOAuthState(data: OAuthPkceState): Promise<void> {
  const raw = JSON.stringify(data);
  try {
    localStorage.setItem(OAUTH_KEY, raw);
  } catch {
    /* ignore */
  }
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: OAUTH_KEY, value: raw });
  }
}

export async function loadOAuthState(): Promise<OAuthPkceState | null> {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: OAUTH_KEY });
    if (value) {
      try {
        return JSON.parse(value) as OAuthPkceState;
      } catch {
        /* fall through */
      }
    }
  }
  try {
    const raw = localStorage.getItem(OAUTH_KEY) ?? sessionStorage.getItem(OAUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OAuthPkceState;
  } catch {
    return null;
  }
}

export async function clearOAuthState(): Promise<void> {
  try {
    localStorage.removeItem(OAUTH_KEY);
    sessionStorage.removeItem(OAUTH_KEY);
  } catch {
    /* ignore */
  }
  if (Capacitor.isNativePlatform()) {
    await Preferences.remove({ key: OAUTH_KEY });
  }
}
