import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SessionBindError } from "@elfcom/crypto";
import { requireCapability } from "../auth/node-jwt.js";
import { messagingService } from "../services/messaging.js";

const bindBody = z.object({
  sid: z.string().min(1),
  ownerTrustId: z.string().min(1),
  zk_bind: z.string().min(1),
  sessionKeyBase64: z.string().min(1),
  ttlSeconds: z.number().int().positive().optional(),
});

const sendBody = z.object({
  body: z.string().min(1).max(4000),
});

const linkBody = z.object({
  channel: z.enum(["whatsapp", "telegram", "email", "instagram", "x", "dm", "bus"]),
  handle: z.string().min(1).max(320),
});

function bindError(reply: import("fastify").FastifyReply, err: unknown) {
  if (err instanceof SessionBindError) {
    return reply.code(403).send({ error: err.code, message: err.message });
  }
  throw err;
}

export async function v1Routes(app: FastifyInstance) {
  app.post("/v1/session/bind", async (req, reply) => {
    await requireCapability(req, reply, ["session:bind"]);
    if (reply.sent) return;

    const body = bindBody.parse(req.body);
    const auth = req.elfcomAuth!;
    if (body.ownerTrustId !== auth.sub) {
      return reply.code(403).send({ error: "forbidden", message: "ownerTrustId must match JWT sub" });
    }
    if (body.sid !== auth.sid || body.zk_bind !== auth.zk_bind) {
      return reply.code(403).send({ error: "forbidden", message: "sid/zk_bind must match JWT" });
    }

    try {
      messagingService.bindSession(body);
      return reply.code(204).send();
    } catch (err) {
      return reply.code(400).send({
        error: "bind_failed",
        message: err instanceof Error ? err.message : "bind failed",
      });
    }
  });

  app.delete("/v1/session/bind", async (req, reply) => {
    await requireCapability(req, reply, ["session:bind"]);
    if (reply.sent) return;
    messagingService.unbindSession(req.elfcomAuth!.sid);
    return reply.code(204).send();
  });

  app.post("/v1/channels/link", async (req, reply) => {
    await requireCapability(req, reply, []);
    if (reply.sent) return;
    const auth = req.elfcomAuth!;
    const hasScope =
      auth.scp.includes("channel:link") ||
      auth.scp.includes("session:bind") ||
      auth.scp.includes("thread:write");
    if (!hasScope) {
      return reply.code(403).send({ error: "forbidden", message: "Missing channel:link scope" });
    }

    const body = linkBody.parse(req.body);
    try {
      messagingService.binder.requireOpen({
        sid: auth.sid,
        ownerTrustId: auth.sub,
        zk_bind: auth.zk_bind,
      });
    } catch (err) {
      return bindError(reply, err);
    }

    const linked = messagingService.linkChannel({
      ownerTrustId: auth.sub,
      channel: body.channel,
      handle: body.handle,
    });
    return { linked };
  });

  async function inboxHandler(req: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) {
    await requireCapability(req, reply, ["thread:read"]);
    if (reply.sent) return;
    const q = req.query as { channel?: string; envelope?: string };
    const filter = { channel: typeof q.channel === "string" ? q.channel : undefined };
    try {
      if (q.envelope === "1" || q.envelope === "true") {
        const threads = messagingService.listThreadEnvelopes(req.elfcomAuth!, filter);
        return { envelope: true as const, threads };
      }
      const threads = messagingService.listThreads(req.elfcomAuth!, filter);
      return { threads };
    } catch (err) {
      return bindError(reply, err);
    }
  }

  app.get("/v1/inbox", inboxHandler);
  app.get("/v1/threads", inboxHandler);

  // Single-thread GET is owned by primitiveRoutes (`/v1/threads/:userId` dual-handler).
  // Keep nested messages path here (more specific; no conflict).

  app.get<{ Params: { threadId: string } }>(
    "/v1/threads/:threadId/messages",
    async (req, reply) => {
      await requireCapability(req, reply, ["thread:read"]);
      if (reply.sent) return;
      const q = req.query as { envelope?: string };
      try {
        if (q.envelope === "1" || q.envelope === "true") {
          const messages = messagingService.listMessageEnvelopes(
            req.elfcomAuth!,
            req.params.threadId,
          );
          return { envelope: true as const, messages };
        }
        const messages = messagingService.listMessages(req.elfcomAuth!, req.params.threadId);
        return { messages };
      } catch (err) {
        return bindError(reply, err);
      }
    },
  );

  app.post<{ Params: { threadId: string } }>(
    "/v1/threads/:threadId/messages",
    async (req, reply) => {
      await requireCapability(req, reply, ["message:send"]);
      if (reply.sent) return;
      const body = sendBody.parse(req.body);
      try {
        const message = await messagingService.sendMessage(req.elfcomAuth!, {
          threadId: req.params.threadId,
          body: body.body,
        });
        return { message };
      } catch (err) {
        return bindError(reply, err);
      }
    },
  );
}
