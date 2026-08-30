import type { FastifyInstance } from "fastify";
import { requireTrustIdOrCapability, verifyEventsToken } from "../middleware/trustid-auth.js";
import { callHub, type CallSignalKind, type CallType } from "../services/call-hub.js";

/** Requires `@fastify/websocket` already registered (see websocketRoutes). */
export async function callRoutes(app: FastifyInstance) {
  /** WebRTC signaling socket — TrustID / capability JWT (query access_token). */
  app.get("/v1/calls/ws", { websocket: true }, (socket, req) => {
    void (async () => {
      try {
        const q = req.query as { access_token?: string };
        const header = req.headers.authorization;
        const token =
          q.access_token ??
          (header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined);
        if (!token) {
          socket.close(4401, "missing_token");
          return;
        }
        const claims = await verifyEventsToken(token);
        callHub.addSocket(claims.sub, socket);
        socket.send(
          JSON.stringify({
            typ: "call.ready",
            userId: claims.sub,
            ts: new Date().toISOString(),
          }),
        );
      } catch {
        socket.close(4401, "invalid_token");
      }
    })();
  });

  app.post("/v1/calls", async (req, reply) => {
    await requireTrustIdOrCapability(req, reply, []);
    if (reply.sent) return;

    const body = (req.body ?? {}) as { targetTid?: string; type?: CallType };
    const targetTid = String(body.targetTid ?? "").trim();
    const type: CallType = body.type === "VIDEO" ? "VIDEO" : "AUDIO";
    if (!targetTid) {
      return reply.code(400).send({ error: "bad_request", message: "targetTid required" });
    }

    const callerTid = req.elfcomAuth!.sub;
    if (targetTid === callerTid) {
      return reply.code(400).send({ error: "bad_request", message: "cannot call yourself" });
    }

    const call = callHub.createCall(callerTid, targetTid, type);
    return { call };
  });

  app.post<{ Params: { id: string } }>("/v1/calls/:id/accept", async (req, reply) => {
    await requireTrustIdOrCapability(req, reply, []);
    if (reply.sent) return;

    const call = callHub.accept(req.params.id, req.elfcomAuth!.sub);
    if (!call) return reply.code(404).send({ error: "not_found" });
    return { call };
  });

  app.post<{ Params: { id: string } }>("/v1/calls/:id/signal", async (req, reply) => {
    await requireTrustIdOrCapability(req, reply, []);
    if (reply.sent) return;

    const body = (req.body ?? {}) as { kind?: CallSignalKind; payload?: unknown };
    const kind = body.kind;
    if (kind !== "offer" && kind !== "answer" && kind !== "ice" && kind !== "hangup") {
      return reply.code(400).send({ error: "bad_request", message: "invalid kind" });
    }

    const call = callHub.relaySignal(req.params.id, req.elfcomAuth!.sub, kind, body.payload ?? null);
    if (!call) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/v1/calls/:id/hangup", async (req, reply) => {
    await requireTrustIdOrCapability(req, reply, []);
    if (reply.sent) return;

    const call = callHub.hangup(req.params.id, req.elfcomAuth!.sub);
    if (!call) return reply.code(404).send({ error: "not_found" });
    return { call };
  });
}
