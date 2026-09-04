/**
 * TrustID production endpoints for ElfCom (cross-origin OAuth + API).
 * Passkeys live on trustedid.netlify.app — silent login redirects there with ui_mode=silent.
 */
import { Capacitor } from "@capacitor/core";

export const TRUST_ID_AUTH = {
  /** Railway TrustID API (CORS allows ElfCom). */
  apiBaseUrl: (
    import.meta.env.VITE_TRUSTID_BASE_URL?.trim() ||
    "https://lucid-integrity-production.up.railway.app"
  ).replace(/\/+$/, ""),
  /** PWA host where WebAuthn rpId matches (Face ID / fingerprint). */
  webOrigin: (
    import.meta.env.VITE_TRUSTID_WEB_ORIGIN?.trim() || "https://trustedid.netlify.app"
  ).replace(/\/+$/, ""),
  clientId: "elfcom_web",
  scopes:
    "openid identity.basic identity.zk_claims identity.trust_level identity.verification_status",
  silentAssertPath: "/v1/auth/silent-assert",
} as const;

/** Custom URL scheme registered in AndroidManifest / Info.plist. */
export const NATIVE_OAUTH_REDIRECT = "com.elfcom.app://auth/callback";
export const WEB_OAUTH_REDIRECT = "https://elfcom.netlify.app/auth/callback";

const ENROLLED_KEY = "elfcom.trustid.enrolled";

/** Device previously completed a TrustID login for ElfCom. */
export function hasTrustIdOnDevice(): boolean {
  try {
    return localStorage.getItem(ENROLLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTrustIdOnDevice(): void {
  try {
    localStorage.setItem(ENROLLED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearTrustIdOnDevice(): void {
  try {
    localStorage.removeItem(ENROLLED_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * OAuth redirect_uri.
 * Native APK uses custom scheme so Capacitor Browser can return into the app
 * without relying on sessionStorage across WebView hops.
 */
export function trustIdCallbackUri(): string {
  if (typeof window === "undefined") return WEB_OAUTH_REDIRECT;
  if (Capacitor.isNativePlatform()) {
    return (
      import.meta.env.VITE_TRUSTID_NATIVE_REDIRECT?.trim() || NATIVE_OAUTH_REDIRECT
    );
  }
  // Prefer stable production callback when served from file:// or capacitor host.
  if (window.location.protocol === "https:" || window.location.protocol === "http:") {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return `${window.location.origin}/auth/callback`;
    }
    return `${window.location.origin}/auth/callback`;
  }
  return WEB_OAUTH_REDIRECT;
}

/** Open TrustID to create an identity (first-time users). */
export function trustIdCreateUrl(): string {
  const u = new URL(TRUST_ID_AUTH.webOrigin);
  u.searchParams.set("intent", "create");
  const returnTo = Capacitor.isNativePlatform()
    ? "com.elfcom.app://login"
    : trustIdCallbackUri().replace(/\/auth\/callback$/, "/login");
  u.searchParams.set("return_to", returnTo);
  u.searchParams.set("app", "ElfCom");
  return u.toString();
}
