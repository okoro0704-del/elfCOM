import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { z } from "zod";
import type { ElfComChannel } from "@elfcom/contract";
import { SessionBindError } from "@elfcom/crypto";
import { requireTrustIdOrCapability, verifyEventsToken } from "../middleware/trustid-auth.js";
import { messagingService } from "../services/messaging.js";
import { webSocketService } from "../services/websocket.service.js";

const channelEnum = z.enum([
  "whatsapp",
  "telegram",
  "email",
  "instagram",
  "x",
  "dm",
  "bus",
]);

const p2pEnvelopeSchema = z.object({
  fromTrustId: z.string().min(1),
  toTrustId: z.string().min(1),
  threadId: z.string().min(1),
  payloadBase64: z.string().min(1),
  signatureBase64: z.string().min(1),
  createdAt: z.string().min(1),
});

const sendEnvelope = z.object({
  recipientId: z.string().min(1),
  body: z.string().min(1).max(4000),
  threadId: z.string().min(1).optional(),
  channel: channelEnum.optional(),
  peerHandle: z.string().optional(),
  peerRef: z.string().optional(),
  tenantId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  /** Optional signed P2P envelope — verified before RouterService dispatch. */
  p2p: p2pEnvelopeSchema.optional(),
  fallbackChannels: z.array(channelEnum).optional(),
});

const peerKeyBody = z.object({
  ownerTrustId: z.string().min(1),
  publicKeyPem: z.string().min(1),
});

const batchBody = z.object({
  messages: z.array(sendEnvelope).min(1).max(50),
});

function bindError(reply: import("fastify").FastifyReply, err: unknown) {
  if (err instanceof SessionBindError) {
    return reply.code(403).send({ error: err.code, message: err.message });
  }
  throw err;
}

/**
 * LifeOS / HospitalityOS primitive HTTP surface.
 */
export async function primitiveRoutes(app: FastifyInstance) {
  app.post("/v1/messages/send", async (req, reply) => {
    await requireTrustIdOrCapability(req, reply, ["message:send"]);
    if (reply.sent) return;
    const auth = req.elfcomAuth!;
    const body = sendEnvelope.parse(req.body);
    if (body.recipientId !== auth.sub) {
      return reply.code(403).send({
        error: "forbidden",
        message: "recipientId must match JWT sub",
      });
    }
    try {
      const result = await messagingService.sendPrimitive(auth, body);
      return result;
    } catch (err) {
      return bindError(reply, err);
    }
  });

  app.post("/v1/messages/batch", async (req, reply) => {
    await requireTrustIdOrCapability(req, reply, ["message:send"]);
    if (reply.sent) return;
    const auth = req.elfcomAuth!;
    const body = batchBody.parse(req.body);
    for (const m of body.messages) {
      if (m.recipientId !== auth.sub) {
        return reply.code(403).send({
          error: "forbidden",
          message: "all recipientId values must match JWT sub",
        });
      }
    }
    try {
      const results = await Promise.all(
        body.messages.map((m) => messagingService.sendPrimitive(auth, m)),
      );
      return { results };
    } catch (err) {
      return bindError(reply, err);
    }
  });

  /** Register a device public key for P2P DM signature verification. */
  app.post("/v1/p2p/keys", async (req, reply) => {
    await requireTrustIdOrCapability(req, reply, ["session:bind"]);
    if (reply.sent) return;
    const auth = req.elfcomAuth!;
    const body = peerKeyBody.parse(req.body);
    if (body.ownerTrustId !== auth.sub) {
      return reply.code(403).send({
        error: "forbidden",
        message: "ownerTrustId must match JWT sub",
      });
    }
    messagingService.registerPeerPublicKey(body.ownerTrustId, body.publicKeyPem);
    return { ok: true as const, ownerTrustId: body.ownerTrustId };
  });

  app.get<{ Params: { userId: string } }>("/v1/threads/:userId", async (req, reply) => {
    await requireTrustIdOrCapability(req, reply, ["thread:read"]);
    if (reply.sent) return;
    const auth = req.elfcomAuth!;
    const q = req.query as { channel?: string; envelope?: string };

    // Dual-purpose (Phase C+D): param === JWT sub → list inbox; else → single thread by id.
    if (req.params.userId === auth.sub) {
      try {
        if (q.envelope === "1" || q.envelope === "true") {
          const threads = messagingService.listThreadEnvelopes(auth, {
            channel: typeof q.channel === "string" ? q.channel : undefined,
          });
          return { userId: req.params.userId, envelope: true as const, threads };
        }
        const threads = messagingService.listThreads(auth, {
          channel: typeof q.channel === "string" ? (q.channel as ElfComChannel) : undefined,
        });
        return { userId: req.params.userId, threads };
      } catch (err) {
        return bindError(reply, err);
      }
    }

    try {
      const thread = messagingService.getThread(auth, req.params.userId);
      if (!thread) return reply.code(404).send({ error: "not_found" });
      return { thread };
    } catch (err) {
      return bindError(reply, err);
    }
  });
}

/**
 * WebSocket realtime bus — subscribe with Bearer JWT (query access_token or first message).
 */
export async function websocketRoutes(app: FastifyInstance) {
  await app.register(websocket);

  app.get("/v1/events", { websocket: true }, (socket, req) => {
    void (async () => {
      try {
        const q = req.query as { access_token?: string; tenantId?: string };
        const header = req.headers.authorization;
        const token =
          q.access_token ??
          (header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined);
        if (!token) {
          socket.close(4401, "missing_token");
          return;
        }
        const claims = await verifyEventsToken(token);
        if (!claims.scp.includes("events:subscribe") && !claims.scp.includes("thread:read")) {
          socket.close(4403, "missing_scope");
          return;
        }
        webSocketService.addClient({
          socket,
          userId: claims.sub,
          tenantId: q.tenantId,
        });
        socket.send(
          JSON.stringify({
            typ: "session.ready",
            userId: claims.sub,
            ts: new Date().toISOString(),
          }),
        );
      } catch {
        socket.close(4401, "invalid_token");
      }
    })();
  });
}
