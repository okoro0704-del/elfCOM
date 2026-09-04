/**
 * APNs HTTP/2 provider (token-based auth).
 * Env: APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_PRIVATE_KEY (PEM),
 * optional APNS_PRODUCTION=true.
 */
import { createPrivateKey, createSign } from "node:crypto";
import { config } from "../../config.js";
import type { PushDispatchPayload, PushSendResult } from "./types.js";

let cachedJwt: { token: string; exp: number } | null = null;

export function apnsConfigured(): boolean {
  return Boolean(
    config.apnsKeyId && config.apnsTeamId && config.apnsBundleId && config.apnsPrivateKey,
  );
}

function mintApnsJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.exp - 60 > now) return cachedJwt.token;

  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: config.apnsKeyId })).toString(
    "base64url",
  );
  const claims = Buffer.from(
    JSON.stringify({ iss: config.apnsTeamId, iat: now }),
  ).toString("base64url");
  const unsigned = `${header}.${claims}`;
  const key = createPrivateKey(config.apnsPrivateKey.replace(/\\n/g, "\n"));
  const sign = createSign("SHA256");
  sign.update(unsigned);
  sign.end();
  const sig = sign.sign(key).toString("base64url");
  const token = `${unsigned}.${sig}`;
  cachedJwt = { token, exp: now + 3500 };
  return token;
}

export async function sendApnsPush(
  deviceToken: string,
  payload: PushDispatchPayload,
): Promise<PushSendResult> {
  if (!apnsConfigured()) {
    if (config.pushDryRun) {
      return { ok: true, providerMessageId: `dry-run-apns:${deviceToken.slice(0, 8)}` };
    }
    return { ok: false, error: "apns_unconfigured" };
  }

  const host = config.apnsProduction
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
  const hasVisual = Boolean(payload.title || payload.body);
  const priority = payload.priority === "NORMAL" ? "5" : "10";

  const aps: Record<string, unknown> = {
    "mutable-content": 1,
  };
  if (hasVisual) {
    aps.alert = { title: payload.title, body: payload.body };
    aps.sound = "default";
    if (payload.priority === "MAX" || payload.priority === "HIGH") {
      aps["interruption-level"] = "time-sensitive";
    }
  } else {
    aps["content-available"] = 1;
  }

  const body = {
    aps,
    ...(payload.dataPayload ?? {}),
    channelId: payload.channelId,
  };

  try {
    const res = await fetch(`${host}/3/device/${deviceToken}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${mintApnsJwt()}`,
        "apns-topic": config.apnsBundleId,
        "apns-push-type": hasVisual ? "alert" : "background",
        "apns-priority": priority,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const id = res.headers.get("apns-id") ?? undefined;
      return { ok: true, providerMessageId: id };
    }

    const text = await res.text();
    const invalidate = res.status === 410 || /BadDeviceToken|Unregistered/i.test(text);
    return {
      ok: false,
      error: `apns_${res.status}:${text.slice(0, 200)}`,
      invalidateToken: invalidate,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
