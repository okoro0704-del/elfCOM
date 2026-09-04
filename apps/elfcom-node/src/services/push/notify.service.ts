/**
 * Universal notification dispatch — resolve tokens → providers → delivery log.
 */
import { sendApnsPush } from "../providers/apns.provider.js";
import { sendFcmPush } from "../providers/fcm.provider.js";
import { sendWebPush } from "../providers/web-push.provider.js";
import type { PushDispatchPayload } from "../providers/types.js";
import {
  createNotificationDelivery,
  createNotificationJob,
  deactivateDeviceToken,
  listActiveTokens,
  updateNotificationJobStatus,
  type PriorityLevel,
} from "./push-store.js";

export type DispatchNotificationInput = {
  tenantId?: string | null;
  appId: string;
  targetTrustId: string;
  /** Optional: only devices registered for this appId. */
  targetAppId?: string;
  title?: string;
  body?: string;
  priority?: PriorityLevel;
  channelId?: string;
  dataPayload?: Record<string, unknown>;
};

export type DispatchNotificationResult = {
  jobId: string;
  dispatchedToCount: number;
  successCount: number;
  failureCount: number;
};

async function sendToDevice(
  platform: "ANDROID" | "IOS" | "WEB",
  token: string,
  payload: PushDispatchPayload,
) {
  if (platform === "IOS") return sendApnsPush(token, payload);
  if (platform === "WEB") {
    // Prefer VAPID web-push when token looks like a PushSubscription JSON.
    if (token.trim().startsWith("{")) return sendWebPush(token, payload);
    return sendFcmPush(token, payload);
  }
  return sendFcmPush(token, payload);
}

export async function dispatchNotification(
  input: DispatchNotificationInput,
): Promise<DispatchNotificationResult> {
  const priority = input.priority ?? "HIGH";
  const channelId = input.channelId ?? "default_alerts";
  const payload: PushDispatchPayload = {
    title: input.title,
    body: input.body,
    priority,
    channelId,
    dataPayload: input.dataPayload,
  };

  const activeTokens = await listActiveTokens({
    trustId: input.targetTrustId,
    appId: input.targetAppId,
  });

  if (activeTokens.length === 0) {
    const err = new Error("No active push tokens found for specified trustId.");
    (err as Error & { code: string }).code = "no_tokens";
    throw err;
  }

  const job = await createNotificationJob({
    tenantId: input.tenantId,
    appId: input.appId,
    targetTrustId: input.targetTrustId,
    title: input.title ?? null,
    body: input.body ?? null,
    priority,
    channelId,
    dataPayload: input.dataPayload ?? null,
    status: "PROCESSING",
  });

  let successCount = 0;
  let failureCount = 0;

  await Promise.all(
    activeTokens.map(async (device) => {
      try {
        const result = await sendToDevice(device.platform, device.pushToken, payload);
        if (result.ok) {
          successCount += 1;
          await createNotificationDelivery({
            jobId: job.id,
            pushToken: device.pushToken,
            platform: device.platform,
            status: "SUCCESS",
            deliveredAt: new Date(),
          });
        } else {
          failureCount += 1;
          await createNotificationDelivery({
            jobId: job.id,
            pushToken: device.pushToken,
            platform: device.platform,
            status: "FAILED",
            failureReason: result.error ?? "send_failed",
          });
          if (result.invalidateToken) {
            await deactivateDeviceToken(device.pushToken);
          }
        }
      } catch (error) {
        failureCount += 1;
        await createNotificationDelivery({
          jobId: job.id,
          pushToken: device.pushToken,
          platform: device.platform,
          status: "FAILED",
          failureReason: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  await updateNotificationJobStatus(
    job.id,
    successCount > 0 ? "COMPLETED" : "FAILED",
  );

  return {
    jobId: job.id,
    dispatchedToCount: activeTokens.length,
    successCount,
    failureCount,
  };
}
