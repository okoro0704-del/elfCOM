/**
 * TrustID production endpoints for ElfCom (cross-origin OAuth + API).
 * Passkeys run on trustedid.netlify.app — ElfCom redirects there via OAuth.
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

export function trustIdCallbackUri(): string {
  if (typeof window === "undefined") return "https://elfcom.netlify.app/auth/callback";
  return `${window.location.origin}/auth/callback`;
}
