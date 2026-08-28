import { createHmac } from "node:crypto";
import type { OutboundPacket } from "@elfcom/contract";
import {
  type ConnectorHttpRequest,
  type ConnectorVerifyResult,
  type IChannelConnector,
  type ParsedIngress,
  hashRawBody,
  queryGet,
} from "@elfcom/connectors-core";

export type XConnectorOptions = {
  consumerSecret?: string;
};

/**
 * X (Twitter) Account Activity style adapter — CRC challenge + DM event parse stub.
 * Wire full API v2 subscription payloads as provider docs evolve.
 */
export class XConnector implements IChannelConnector {
  readonly channel = "x" as const;

  constructor(private readonly opts: XConnectorOptions = {}) {}

  async handleVerification(req: ConnectorHttpRequest): Promise<ConnectorVerifyResult | null> {
    if (req.method.toUpperCase() !== "GET") return null;
    const crc = queryGet(req.query, "crc_token");
    if (!crc || !this.opts.consumerSecret) return null;
    const hash = createHmac("sha256", this.opts.consumerSecret).update(crc).digest("base64");
    return {
      kind: "challenge",
      status: 200,
      body: JSON.stringify({ response_token: `sha256=${hash}` }),
      contentType: "application/json",
    };
  }

  async verifyWebhook(_req: ConnectorHttpRequest): Promise<boolean> {
    // Production: validate X-Twitter-Webhooks-Signature. Phase B allows when secret unset.
    return true;
  }

  async parseIngress(req: ConnectorHttpRequest): Promise<ParsedIngress[]> {
    const body = req.body as XWebhookBody | undefined;
    const events = body?.direct_message_events ?? [];
    if (!events.length) return [];
    const metaHash = hashRawBody(req.rawBody ?? JSON.stringify(body));
    const out: ParsedIngress[] = [];

    for (const ev of events) {
      const msg = ev.message_create?.message_data;
      const sender = ev.message_create?.sender_id;
      const target = ev.message_create?.target?.recipient_id;
      if (!sender || !ev.id) continue;
      out.push({
        peerHandle: `x:${sender}`,
        inboxHandle: target ? `x:${target}` : undefined,
        draft: {
          channel: "x",
          providerMessageId: ev.id,
          threadKey: "",
          sentAt: ev.created_timestamp
            ? new Date(Number(ev.created_timestamp)).toISOString()
            : new Date().toISOString(),
          fromRef: "",
          toRef: "",
          contentType: "text",
          plaintextBody: msg?.text,
          rawProviderMetaHash: metaHash,
        },
      });
    }
    return out;
  }

  async send(packet: OutboundPacket): Promise<{ providerMessageId: string }> {
    return { providerMessageId: `x-stub-${packet.threadId}-${Date.now()}` };
  }
}

type XWebhookBody = {
  direct_message_events?: Array<{
    id: string;
    created_timestamp?: string;
    message_create?: {
      sender_id?: string;
      target?: { recipient_id?: string };
      message_data?: { text?: string };
    };
  }>;
};
