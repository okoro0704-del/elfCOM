import { createHmac } from "node:crypto";
import type { OutboundPacket } from "@elfcom/contract";
import {
  type ConnectorHttpRequest,
  type ConnectorVerifyResult,
  type IChannelConnector,
  type ParsedIngress,
  hashRawBody,
  headerGet,
  queryGet,
  timingSafeEqualStr,
} from "@elfcom/connectors-core";

export type InstagramConnectorOptions = {
  verifyToken: string;
  appSecret?: string;
};

/** Instagram Messaging (Meta) webhook — same challenge pattern as WhatsApp. */
export class InstagramConnector implements IChannelConnector {
  readonly channel = "instagram" as const;

  constructor(private readonly opts: InstagramConnectorOptions) {}

  async handleVerification(req: ConnectorHttpRequest): Promise<ConnectorVerifyResult | null> {
    if (req.method.toUpperCase() !== "GET") return null;
    const mode = queryGet(req.query, "hub.mode");
    const token = queryGet(req.query, "hub.verify_token");
    const challenge = queryGet(req.query, "hub.challenge");
    if (mode === "subscribe" && token && challenge && timingSafeEqualStr(token, this.opts.verifyToken)) {
      return { kind: "challenge", status: 200, body: challenge, contentType: "text/plain" };
    }
    return { kind: "challenge", status: 403, body: "forbidden", contentType: "text/plain" };
  }

  async verifyWebhook(req: ConnectorHttpRequest): Promise<boolean> {
    if (req.method.toUpperCase() === "GET") return true;
    if (!this.opts.appSecret) return true;
    const sig = headerGet(req.headers, "x-hub-signature-256");
    if (!sig?.startsWith("sha256=") || !req.rawBody) return false;
    const expected =
      "sha256=" +
      createHmac("sha256", this.opts.appSecret).update(req.rawBody).digest("hex");
    return timingSafeEqualStr(sig, expected);
  }

  async parseIngress(req: ConnectorHttpRequest): Promise<ParsedIngress[]> {
    const body = req.body as IgWebhookBody | undefined;
    if (!body?.entry?.length) return [];
    const metaHash = hashRawBody(req.rawBody ?? JSON.stringify(body));
    const out: ParsedIngress[] = [];

    for (const entry of body.entry) {
      for (const messaging of entry.messaging ?? []) {
        const text = messaging.message?.text;
        const mid = messaging.message?.mid;
        if (!messaging.sender?.id || !mid) continue;
        out.push({
          peerHandle: `ig:${messaging.sender.id}`,
          inboxHandle: messaging.recipient?.id ? `ig:${messaging.recipient.id}` : undefined,
          draft: {
            channel: "instagram",
            providerMessageId: mid,
            threadKey: "",
            sentAt: messaging.timestamp
              ? new Date(messaging.timestamp).toISOString()
              : new Date().toISOString(),
            fromRef: "",
            toRef: "",
            contentType: text ? "text" : "media_ref",
            plaintextBody: text,
            mediaRef: messaging.message?.attachments?.[0]?.payload?.url,
            rawProviderMetaHash: metaHash,
          },
        });
      }
    }
    return out;
  }

  async send(packet: OutboundPacket): Promise<{ providerMessageId: string }> {
    return { providerMessageId: `ig-stub-${packet.threadId}-${Date.now()}` };
  }
}

type IgWebhookBody = {
  entry?: Array<{
    messaging?: Array<{
      sender?: { id: string };
      recipient?: { id: string };
      timestamp?: number;
      message?: {
        mid: string;
        text?: string;
        attachments?: Array<{ payload?: { url?: string } }>;
      };
    }>;
  }>;
};
