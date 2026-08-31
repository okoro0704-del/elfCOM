/**
 * TrustID production endpoints for ElfCom (cross-origin OAuth + API).
 * Passkeys live on trustedid.netlify.app — silent login redirects there with ui_mode=silent.
 */
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

export function trustIdCallbackUri(): string {
  if (typeof window === "undefined") return "https://elfcom.netlify.app/auth/callback";
  return `${window.location.origin}/auth/callback`;
}

/** Open TrustID to create an identity (first-time users). */
export function trustIdCreateUrl(): string {
  const u = new URL(TRUST_ID_AUTH.webOrigin);
  u.searchParams.set("intent", "create");
  u.searchParams.set("return_to", trustIdCallbackUri().replace(/\/auth\/callback$/, "/login"));
  u.searchParams.set("app", "ElfCom");
  return u.toString();
}
