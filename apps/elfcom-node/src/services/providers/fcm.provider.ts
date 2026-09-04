/**
 * Firebase Cloud Messaging HTTP v1 (Android + Web FCM tokens).
 * Uses service-account JWT + fetch — no firebase-admin dependency.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS
 */
import { readFileSync } from "node:fs";
import { createPrivateKey, createSign } from "node:crypto";
import { config } from "../../config.js";
import type { PushDispatchPayload, PushSendResult } from "./types.js";

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

let cachedSa: ServiceAccount | null | undefined;
let cachedAccess: { token: string; exp: number } | null = null;

function loadServiceAccount(): ServiceAccount | null {
  if (cachedSa !== undefined) return cachedSa;
  try {
    if (config.firebaseServiceAccountJson) {
      cachedSa = JSON.parse(config.firebaseServiceAccountJson) as ServiceAccount;
      return cachedSa;
    }
    const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (path) {
      cachedSa = JSON.parse(readFileSync(path, "utf8")) as ServiceAccount;
      return cachedSa;
    }
  } catch (err) {
    console.warn("[elfcom:fcm] failed to load service account", err);
  }
  cachedSa = null;
  return null;
}

export function fcmConfigured(): boolean {
  const sa = loadServiceAccount();
  return Boolean(sa?.project_id && sa?.client_email && sa?.private_key);
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccess && cachedAccess.exp - 60 > now) return cachedAccess.token;

  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${claims}`;
  const key = createPrivateKey(sa.private_key.replace(/\\n/g, "\n"));
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  sign.end();
  const assertion = `${unsigned}.${sign.sign(key).toString("base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`fcm_oauth_${res.status}:${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccess = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return cachedAccess.token;
}

function stringifyData(data?: Record<string, unknown>): Record<string, string> | undefined {
  if (!data) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return Object.keys(out).length ? out : undefined;
}

export async function sendFcmPush(
  token: string,
  payload: PushDispatchPayload,
): Promise<PushSendResult> {
  const sa = loadServiceAccount();
  if (!sa) {
    if (config.pushDryRun) {
      return { ok: true, providerMessageId: `dry-run-fcm:${token.slice(0, 8)}` };
    }
    return { ok: false, error: "fcm_unconfigured" };
  }

  const high = payload.priority === "HIGH" || payload.priority === "MAX";
  const hasVisual = Boolean(payload.title || payload.body);
  const data = stringifyData(payload.dataPayload);

  const message: Record<string, unknown> = {
    token,
    data,
    android: {
      priority: high ? "HIGH" : "NORMAL",
      ...(hasVisual
        ? {
            notification: {
              channel_id: payload.channelId,
              notification_priority:
                payload.priority === "MAX"
                  ? "PRIORITY_MAX"
                  : high
                    ? "PRIORITY_HIGH"
                    : "PRIORITY_DEFAULT",
              visibility: "PUBLIC",
              default_sound: true,
              default_vibrate_timings: true,
              title: payload.title,
              body: payload.body,
            },
          }
        : {}),
    },
  };

  if (hasVisual) {
    message.notification = { title: payload.title, body: payload.body };
  }

  try {
    const accessToken = await getAccessToken(sa);
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ message }),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      const invalidate = /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(text);
      return {
        ok: false,
        error: `fcm_${res.status}:${text.slice(0, 200)}`,
        invalidateToken: invalidate,
      };
    }
    const json = JSON.parse(text) as { name?: string };
    return { ok: true, providerMessageId: json.name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
