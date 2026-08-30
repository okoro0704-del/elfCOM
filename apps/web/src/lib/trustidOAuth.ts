import { TRUST_ID_AUTH, trustIdCallbackUri } from "./trustidConfig";

const OAUTH_KEY = "elfcom.trustid.oauth";

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(length = 64) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return b64url(bytes);
}

async function sha256(input: string) {
  const data = new TextEncoder().encode(input);
  return crypto.subtle.digest("SHA-256", data);
}

/**
 * Start TrustID OAuth + PKCE. Biometrics run on TrustID's origin
 * (trustedid.netlify.app), then return to ElfCom /auth/callback.
 */
export async function beginTrustIdLogin(opts?: { silent?: boolean }) {
  const verifier = randomString(64);
  const challenge = b64url(await sha256(verifier));
  const state = randomString(24);
  const redirect = trustIdCallbackUri();

  sessionStorage.setItem(
    OAUTH_KEY,
    JSON.stringify({ verifier, state, redirect, startedAt: Date.now() }),
  );

  const url = new URL(`${TRUST_ID_AUTH.apiBaseUrl}/oauth/authorize`);
  url.searchParams.set("client_id", TRUST_ID_AUTH.clientId);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", TRUST_ID_AUTH.scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("app_name", "ElfCom");
  if (opts?.silent) {
    url.searchParams.set("ui_mode", "silent");
    url.searchParams.set("auth_mode", "passkey");
  }

  window.location.assign(url.toString());
}

export type TrustIdTokenResponse = {
  access_token: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
};

export async function exchangeTrustIdCode(code: string, state: string): Promise<TrustIdTokenResponse> {
  const raw = sessionStorage.getItem(OAUTH_KEY);
  if (!raw) throw new Error("Missing TrustID login state — try again");
  const saved = JSON.parse(raw) as { verifier: string; state: string; redirect: string };
  if (saved.state !== state) throw new Error("TrustID login state mismatch");

  const res = await fetch(`${TRUST_ID_AUTH.apiBaseUrl}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: saved.redirect,
      client_id: TRUST_ID_AUTH.clientId,
      code_verifier: saved.verifier,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as TrustIdTokenResponse & {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.message || data.error || `Token exchange failed (${res.status})`);
  }
  sessionStorage.removeItem(OAUTH_KEY);
  return data;
}

export type TrustIdUserInfo = {
  sub: string;
  trustId?: string;
  status?: string;
};

export async function fetchTrustIdUserInfo(accessToken: string): Promise<TrustIdUserInfo> {
  const res = await fetch(`${TRUST_ID_AUTH.apiBaseUrl}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  const data = (await res.json().catch(() => ({}))) as TrustIdUserInfo & {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.message || data.error || `userinfo failed (${res.status})`);
  }
  return data;
}

/** Master-device QR payload — open TrustID continue on the paired phone. */
export function masterDevicePairUrl(): string {
  return `${TRUST_ID_AUTH.webOrigin}/continue`;
}
