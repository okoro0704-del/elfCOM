/**
 * Universal push notification routes:
 *   POST   /v1/devices/register
 *   DELETE /v1/devices/unregister
 *   POST   /v1/notify
 *   POST   /v1/baas/notify
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireBaasApiKey, tryBaasApiKeyAuth } from "../auth/baas-api-key.js";
import { requireTrustIdOrCapability } from "../middleware/trustid-auth.js";
import { dispatchNotification } from "../services/push/notify.service.js";
import {
  deactivateDeviceToken,
  upsertDeviceToken,
  type Platform,
} from "../services/push/push-store.js";

const platformSchema = z.enum(["ANDROID", "IOS", "WEB"]);
const prioritySchema = z.enum(["NORMAL", "HIGH", "MAX"]);

const registerSchema = z.object({
  trustId: z.string().min(1).optional(),
  appId: z.string().min(1),
  platform: platformSchema,
  pushToken: z.string().min(8),
  deviceId: z.string().min(1),
});

const unregisterSchema = z.object({
  pushToken: z.string().min(8),
});

const notifySchema = z.object({
  appId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  targetTrustId: z.string().min(1),
  targetAppId: z.string().min(1).optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  priority: prioritySchema.optional(),
  channelId: z.string().min(1).optional(),
  dataPayload: z.record(z.unknown()).optional(),
});

export async function notificationRoutes(app: FastifyInstance) {
  /** Register / refresh a device push token for the authenticated TrustID subject. */
  app.post("/v1/devices/register", async (req, reply) => {
    await requireTrustIdOrCapability(req, reply, []);
    if (reply.sent) return;

    const parsed = registerSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_request", details: parsed.error.flatten() });
    }

    const authTrustId = req.elfcomAuth!.sub;
    const bodyTrustId = parsed.data.trustId;
    if (bodyTrustId && bodyTrustId !== authTrustId) {
      return reply.code(403).send({
        error: "forbidden",
        message: "trustId must match authenticated subject",
      });
    }

    const registered = await upsertDeviceToken({
      trustId: authTrustId,
      appId: parsed.data.appId,
      platform: parsed.data.platform as Platform,
      pushToken: parsed.data.pushToken,
      deviceId: parsed.data.deviceId,
    });

    return { success: true, token: registered };
  });

  /** Soft-deactivate a push token (logout / permission revoked). */
  app.delete("/v1/devices/unregister", async (req, reply) => {
    await requireTrustIdOrCapability(req, reply, []);
    if (reply.sent) return;

    const parsed = unregisterSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_request", details: parsed.error.flatten() });
    }

    const ok = await deactivateDeviceToken(parsed.data.pushToken);
    if (!ok) {
      return reply.code(404).send({ error: "not_found", message: "Push token not found" });
    }
    return { success: true, message: "Push token deactivated." };
  });

  /**
   * Cross-app notify.
   * Auth: BaaS API key OR capability/TrustID JWT with scope notify:send.
   */
  app.post("/v1/notify", async (req, reply) => {
    const viaKey = tryBaasApiKeyAuth(req);
    if (!viaKey) {
      await requireTrustIdOrCapability(req, reply, ["notify:send"]);
      if (reply.sent) return;
    }

    const parsed = notifySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_request", details: parsed.error.flatten() });
    }

    const appId = parsed.data.appId ?? req.baasAuth?.appId;
    if (!appId) {
      return reply.code(400).send({ error: "bad_request", message: "appId required" });
    }
    if (req.baasAuth && parsed.data.appId && parsed.data.appId !== req.baasAuth.appId) {
      return reply.code(403).send({
        error: "forbidden",
        message: "appId must match API key binding",
      });
    }

    const hasVisual = Boolean(parsed.data.title || parsed.data.body);
    const hasData = Boolean(parsed.data.dataPayload && Object.keys(parsed.data.dataPayload).length);
    if (!hasVisual && !hasData) {
      return reply.code(400).send({
        error: "bad_request",
        message: "Provide title/body and/or dataPayload",
      });
    }

    try {
      const result = await dispatchNotification({
        tenantId: parsed.data.tenantId ?? req.baasAuth?.tenantId,
        appId,
        targetTrustId: parsed.data.targetTrustId,
        targetAppId: parsed.data.targetAppId,
        title: parsed.data.title,
        body: parsed.data.body,
        priority: parsed.data.priority,
        channelId: parsed.data.channelId,
        dataPayload: parsed.data.dataPayload,
      });
      return { success: true, ...result };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "no_tokens") {
        return reply.code(404).send({
          error: "no_tokens",
          message: err instanceof Error ? err.message : "No tokens",
        });
      }
      throw err;
    }
  });

  /** Tenant-isolated BaaS notify — API key required. */
  app.post("/v1/baas/notify", async (req, reply) => {
    await requireBaasApiKey(req, reply);
    if (reply.sent) return;

    const parsed = notifySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_request", details: parsed.error.flatten() });
    }

    const appId = req.baasAuth!.appId;
    if (parsed.data.appId && parsed.data.appId !== appId) {
      return reply.code(403).send({
        error: "forbidden",
        message: "appId must match API key binding",
      });
    }

    try {
      const result = await dispatchNotification({
        tenantId: parsed.data.tenantId ?? req.baasAuth!.tenantId,
        appId,
        targetTrustId: parsed.data.targetTrustId,
        targetAppId: parsed.data.targetAppId,
        title: parsed.data.title,
        body: parsed.data.body,
        priority: parsed.data.priority ?? "HIGH",
        channelId: parsed.data.channelId ?? "default_alerts",
        dataPayload: parsed.data.dataPayload,
      });
      return { success: true, ...result };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "no_tokens") {
        return reply.code(404).send({
          error: "no_tokens",
          message: err instanceof Error ? err.message : "No tokens",
        });
      }
      throw err;
    }
  });
}
