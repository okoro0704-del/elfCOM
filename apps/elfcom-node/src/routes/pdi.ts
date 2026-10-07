import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { messagingService } from "../services/messaging.js";

function serviceTokenMatches(header: string | undefined) {
  const expected = config.pdiServiceToken;
  if (!expected || !header?.toLowerCase().startsWith("bearer ")) return false;
  const presented = Buffer.from(header.slice(7).trim());
  const required = Buffer.from(expected);
  if (presented.length !== required.length) return false;
  return timingSafeEqual(presented, required);
}

/** PDI read of an owner's thread list. Digi owner mapping is supplied by DDI, not by a product. */
export async function pdiRoutes(app: FastifyInstance) {
  app.get("/v1/pdi/inbox", async (req, reply) => {
    if (!config.pdiServiceToken) {
      return reply.code(503).send({ error: "provider_unavailable" });
    }
    if (!serviceTokenMatches(req.headers.authorization)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const ownerRef = typeof (req.query as { ownerRef?: string }).ownerRef === "string" ? (req.query as { ownerRef: string }).ownerRef : "";
    if (!ownerRef.startsWith("elfcom:")) {
      return reply.code(400).send({ error: "invalid_owner" });
    }
    try {
      const threads = await messagingService.listInboxForOwner(ownerRef);
      return { ownerRef, threads };
    } catch {
      return reply.code(503).send({ error: "provider_unavailable" });
    }
  });
}
