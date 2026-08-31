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

/** Decode JWT payload without verify — token just issued by TrustID. */
export function trustIdFromAccessToken(accessToken: string): string | null {
  try {
    const part = accessToken.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as Record<string, unknown>;
    const tid =
      (typeof payload.trustId === "string" && payload.trustId) ||
      (typeof payload.trust_id === "string" && payload.trust_id) ||
      (typeof payload.sub === "string" && payload.sub) ||
      null;
    return tid;
  } catch {
    return null;
  }
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

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12_000);

  try {
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
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as TrustIdTokenResponse & {
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      throw new Error(data.message || data.error || `Token exchange failed (${res.status})`);
    }
    if (!data.access_token) throw new Error("TrustID returned no access token");
    sessionStorage.removeItem(OAUTH_KEY);
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("TrustID sign-in timed out — try again");
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

export type TrustIdUserInfo = {
  sub: string;
  trustId?: string;
  status?: string;
};

export async function fetchTrustIdUserInfo(accessToken: string): Promise<TrustIdUserInfo> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`${TRUST_ID_AUTH.apiBaseUrl}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}`, accept: "application/json" },
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as TrustIdUserInfo & {
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      throw new Error(data.message || data.error || `userinfo failed (${res.status})`);
    }
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("TrustID userinfo timed out");
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Resolve identity from token JWT first; userinfo only as fallback. */
export async function resolveTrustIdSession(code: string, state: string) {
  const tokens = await exchangeTrustIdCode(code, state);
  let trustId = trustIdFromAccessToken(tokens.access_token);
  if (!trustId) {
    const info = await fetchTrustIdUserInfo(tokens.access_token);
    trustId = info.trustId || info.sub;
  }
  if (!trustId) throw new Error("TrustID did not return an identity");
  const expiresAt =
    typeof tokens.expires_in === "number"
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : undefined;
  return { accessToken: tokens.access_token, trustId, expiresAt };
}

/** Master-device QR payload — open TrustID continue on the paired phone. */
export function masterDevicePairUrl(): string {
  return `${TRUST_ID_AUTH.webOrigin}/continue`;
}
