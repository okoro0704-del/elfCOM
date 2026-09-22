/**
 * Digi-authorized delegated messaging path (Phase T4).
 * Human TrustID/capability path remains on /v1/threads/:id/messages.
 */
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "../config.js";
import { messagingService } from "../services/messaging.js";
import { persistAudit } from "../persistence/postgres.js";
import {
  ELFCOM_AUDIENCE,
  elfComConversationResource,
  elfComRecipientResource,
  verifyAuthority,
  type VerifiedAuthority,
} from "../authority/verifier.js";

const delegatedSendBody = z.object({
  body: z.string().min(1).max(4000),
  conversationId: z.string().min(1).max(320).optional(),
  recipientTrustId: z.string().min(1).max(320).optional(),
  /** Actor key that must match the capability token (possession + claim match). */
  actor: z.string().min(3).max(320),
  idempotencyKey: z.string().min(8).max(200).optional(),
  correlationId: z.string().min(8).max(200).optional(),
});

type Metric =
  | "authority_verify_success"
  | "authority_verify_failure"
  | "authority_wrong_audience"
  | "authority_wrong_resource"
  | "authority_expired"
  | "authority_replay"
  | "authority_limit_denied";

const metrics: Record<Metric, number> = {
  authority_verify_success: 0,
  authority_verify_failure: 0,
  authority_wrong_audience: 0,
  authority_wrong_resource: 0,
  authority_expired: 0,
  authority_replay: 0,
  authority_limit_denied: 0,
};

function bump(m?: string) {
  if (m && m in metrics) metrics[m as Metric] += 1;
}

const idempotencyCache = new Map<string, { messageId: string; createdAt: number }>();

async function consumeAtDigi(input: {
  token: string;
  actor: string;
  action: string;
  resource: string;
  correlationId: string;
  actionId: string;
}): Promise<{ ok: true; grantId: string; jti: string } | { ok: false; reason: string }> {
  const base = config.digiAuthorityConsumeUrl?.replace(/\/$/, "");
  if (!base) {
    return { ok: false, reason: "digi_consume_unconfigured" };
  }
  const res = await fetch(`${base}/v1/authority/consume`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: input.token,
      audience: ELFCOM_AUDIENCE,
      actor: input.actor,
      action: input.action,
      resource: input.resource,
      correlationId: input.correlationId,
      actionId: input.actionId,
    }),
  });
  const json = (await res.json()) as {
    decision?: string;
    reason?: string;
    grantId?: string;
    jti?: string;
  };
  if (!res.ok || json.decision !== "ALLOW") {
    return { ok: false, reason: json.reason ?? "consume_denied" };
  }
  return { ok: true, grantId: String(json.grantId), jti: String(json.jti) };
}

export function getAuthorityMetrics() {
  return { ...metrics };
}

export async function authorityRoutes(app: FastifyInstance) {
  app.get("/v1/authority/metrics", async () => ({
    metrics: getAuthorityMetrics(),
  }));

  /**
   * Delegated message.send — Digi capability Bearer required.
   * Resource is DERIVED from conversationId/recipientTrustId (actual operation),
   * then checked against the token — confused-deputy safe.
   */
  app.post("/v1/authority/messages/send", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header?.toLowerCase().startsWith("bearer ")) {
      bump("authority_verify_failure");
      return reply.code(401).send({ decision: "DENY", reason: "missing_token" });
    }
    const token = header.slice(7).trim();
    const parsed = delegatedSendBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const body = parsed.data;

    let resource: string;
    let threadId: string;
    if (body.conversationId) {
      threadId = body.conversationId;
      resource = elfComConversationResource(body.conversationId);
    } else if (body.recipientTrustId) {
      threadId = `dm:authority:${body.recipientTrustId}`;
      resource = elfComRecipientResource(body.recipientTrustId);
    } else {
      return reply
        .code(400)
        .send({ error: "invalid_request", message: "conversationId or recipientTrustId required" });
    }

    const jwksUrl = config.digiAuthorityJwksUrl;
    if (!jwksUrl) {
      bump("authority_verify_failure");
      return reply.code(503).send({ decision: "DENY", reason: "digi_jwks_unconfigured" });
    }

    const verified = await verifyAuthority({
      token,
      audience: ELFCOM_AUDIENCE,
      actor: body.actor,
      action: "message.send",
      resource,
      jwksUrl,
    });

    if (!verified.ok) {
      bump(verified.metric ?? "authority_verify_failure");
      return reply.code(403).send({ decision: "DENY", reason: verified.reason });
    }

    const claims = verified.claims;
    bump("authority_verify_success");

    const ownerTrustId = claims.ownerTrustId ?? claims.sub;
    const correlationId = body.correlationId ?? randomUUID();
    const actionId = randomUUID();
    const idemKey = body.idempotencyKey
      ? `${claims.jti}:${body.idempotencyKey}`
      : `${claims.jti}:${actionId}`;

    const cached = idempotencyCache.get(idemKey);
    if (cached) {
      return {
        decision: "ALLOW",
        messageId: cached.messageId,
        idempotentReplay: true,
        correlationId,
        grantId: claims.grantId,
        jti: claims.jti,
        owner: claims.sub,
        actor: claims.actor,
        ownerTrustId,
      };
    }

    const needsConsume =
      claims.oneTime || typeof claims.limits.maxMessages === "number";
    if (needsConsume || config.digiAuthorityConsumeUrl) {
      if (!config.digiAuthorityConsumeUrl && needsConsume) {
        bump("authority_verify_failure");
        return reply.code(503).send({
          decision: "DENY",
          reason: "digi_consume_unconfigured",
          correlationId,
        });
      }
      if (config.digiAuthorityConsumeUrl) {
        const consumed = await consumeAtDigi({
          token,
          actor: claims.actor,
          action: "message.send",
          resource,
          correlationId,
          actionId,
        });
        if (!consumed.ok) {
          if (consumed.reason === "replay") bump("authority_replay");
          if (String(consumed.reason).includes("maxMessages")) bump("authority_limit_denied");
          return reply.code(403).send({
            decision: "DENY",
            reason: consumed.reason,
            correlationId,
          });
        }
      }
    }

    try {
      const message = await messagingService.sendDelegatedAuthorityMessage({
        ownerTrustId,
        digiOwnerId: claims.sub,
        actor: claims.actor,
        threadId,
        body: body.body,
        peerRef: body.recipientTrustId,
        grantId: claims.grantId,
        jti: claims.jti,
        correlationId,
        actionId,
      });

      idempotencyCache.set(idemKey, {
        messageId: message.id,
        createdAt: Date.now(),
      });

      void persistAudit({
        ownerTrustId,
        op: "authority.action.executed",
        channel: "dm",
        threadId,
        messageId: message.id,
        meta: {
          owner: claims.sub,
          actor: claims.actor,
          action: "message.send",
          resource,
          grantId: claims.grantId,
          jti: claims.jti,
          service: "elfcom",
          result: "ALLOW",
          correlationId,
          actionId,
          performedBy: claims.actor,
        },
      });

      return {
        decision: "ALLOW",
        messageId: message.id,
        threadId,
        correlationId,
        actionId,
        grantId: claims.grantId,
        jti: claims.jti,
        owner: claims.sub,
        actor: claims.actor,
        ownerTrustId,
        performedBy: claims.actor,
      };
    } catch (err) {
      return reply.code(500).send({
        decision: "DENY",
        reason: err instanceof Error ? err.message : "send_failed",
        correlationId,
      });
    }
  });
}

export type { VerifiedAuthority };
