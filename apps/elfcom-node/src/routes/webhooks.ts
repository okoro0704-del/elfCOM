import type { FastifyInstance } from "fastify";
import type { ElfComChannel } from "@elfcom/contract";
import type { ConnectorHttpRequest, ConnectorRegistry } from "@elfcom/connectors-core";
import { messagingService } from "../services/messaging.js";

const OMNICHANNEL: ElfComChannel[] = ["whatsapp", "telegram", "email", "instagram", "x"];

function toConnectorReq(req: {
  method: string;
  headers: Record<string, unknown>;
  query: unknown;
  body: unknown;
}): ConnectorHttpRequest {
  const raw =
    typeof req.body === "string"
      ? Buffer.from(req.body)
      : Buffer.from(JSON.stringify(req.body ?? {}));
  return {
    method: req.method,
    headers: req.headers as Record<string, string | string[] | undefined>,
    query: (req.query ?? {}) as Record<string, string | string[] | undefined>,
    body: typeof req.body === "string" ? safeJson(req.body) : req.body,
    rawBody: raw,
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export async function webhookRoutes(app: FastifyInstance, registry: ConnectorRegistry) {
  app.get<{ Params: { channel: string } }>("/v1/webhooks/:channel", async (req, reply) => {
    const channel = req.params.channel.toLowerCase() as ElfComChannel;
    if (!OMNICHANNEL.includes(channel)) {
      return reply.code(404).send({ error: "unknown_channel" });
    }
    const connector = registry.get(channel);
    if (!connector) return reply.code(404).send({ error: "connector_disabled" });

    const creq = toConnectorReq(req);
    if (connector.handleVerification) {
      const result = await connector.handleVerification(creq);
      if (result?.kind === "challenge") {
        if (result.contentType) reply.header("Content-Type", result.contentType);
        return reply.code(result.status).send(result.body);
      }
    }
    return reply.code(200).send({ ok: true });
  });

  app.post<{ Params: { channel: string } }>("/v1/webhooks/:channel", async (req, reply) => {
    const channel = req.params.channel.toLowerCase() as ElfComChannel;
    if (!OMNICHANNEL.includes(channel)) {
      return reply.code(404).send({ error: "unknown_channel" });
    }
    const connector = registry.get(channel);
    if (!connector) return reply.code(404).send({ error: "connector_disabled" });

    const creq = toConnectorReq(req);
    const ok = await connector.verifyWebhook(creq);
    if (!ok) return reply.code(401).send({ error: "invalid_signature" });

    const parsed = await connector.parseIngress(creq);
    const result = messagingService.ingestParsed(channel, parsed);

    app.log.info(
      { channel, accepted: result.accepted, dropped: result.dropped },
      "omnichannel ingress",
    );

    return { ok: true, ...result };
  });
}
