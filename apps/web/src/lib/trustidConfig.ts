/**
 * Hardcoded TrustID auth target for ElfCom web.
 * Override with VITE_TRUSTID_BASE_URL in Netlify / .env when needed.
 */
export const TRUST_ID_AUTH = {
  baseUrl: (import.meta.env.VITE_TRUSTID_BASE_URL?.trim() || "https://trustid.netlify.app").replace(
    /\/+$/,
    "",
  ),
  clientId: "elfcom-web",
  /** Canonical silent-assert path on TrustID. */
  silentAssertPath: "/v1/auth/silent-assert",
} as const;
