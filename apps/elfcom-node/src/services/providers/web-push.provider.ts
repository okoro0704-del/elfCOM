/**
 * Web Push (VAPID) — optional. Uses dynamic import of `web-push` when installed.
 * Chrome FCM registration tokens should use sendFcmPush instead (JSON subscription → here).
 */
import { config } from "../../config.js";
import type { PushDispatchPayload, PushSendResult } from "./types.js";

export function webPushConfigured(): boolean {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject);
}

type WebPushMod = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options?: { urgency?: string; TTL?: number },
  ) => Promise<{ statusCode?: number }>;
};

export async function sendWebPush(
  pushToken: string,
  payload: PushDispatchPayload,
): Promise<PushSendResult> {
  if (!webPushConfigured()) {
    if (config.pushDryRun) {
      return { ok: true, providerMessageId: `dry-run-web:${pushToken.slice(0, 8)}` };
    }
    return { ok: false, error: "web_push_unconfigured" };
  }

  let webpush: WebPushMod;
  try {
    webpush = (await import("web-push")) as unknown as WebPushMod;
  } catch {
    if (config.pushDryRun) {
      return { ok: true, providerMessageId: `dry-run-web-no-pkg:${pushToken.slice(0, 8)}` };
    }
    return { ok: false, error: "web_push_package_missing" };
  }

  try {
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);

    let subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
    try {
      subscription = JSON.parse(pushToken) as typeof subscription;
    } catch {
      return { ok: false, error: "web_push_token_must_be_json_subscription" };
    }

    const hasVisual = Boolean(payload.title || payload.body);
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      channelId: payload.channelId,
      priority: payload.priority,
      data: payload.dataPayload ?? {},
      silent: !hasVisual,
    });

    const result = await webpush.sendNotification(subscription, body, {
      urgency: payload.priority === "NORMAL" ? "normal" : "high",
      TTL: 60,
    });

    return {
      ok: true,
      providerMessageId: String(result.statusCode ?? "web-push-ok"),
    };
  } catch (err) {
    const statusCode =
      err && typeof err === "object" && "statusCode" in err
        ? Number((err as { statusCode: number }).statusCode)
        : 0;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: msg,
      invalidateToken: statusCode === 404 || statusCode === 410,
    };
  }
}
