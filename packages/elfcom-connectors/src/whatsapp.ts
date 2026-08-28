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

export type WhatsAppConnectorOptions = {
  verifyToken: string;
  appSecret?: string;
  /** Cloud API permanent / system user token */
  accessToken?: string;
  phoneNumberId?: string;
  graphVersion?: string;
  /** Inject for tests */
  fetchImpl?: typeof fetch;
};

/**
 * WhatsApp Cloud API webhook + live Graph send.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api
 */
export class WhatsAppConnector implements IChannelConnector {
  readonly channel = "whatsapp" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: WhatsAppConnectorOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get live(): boolean {
    return Boolean(this.opts.accessToken && this.opts.phoneNumberId);
  }

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
    const body = req.body as WhatsAppWebhookBody | undefined;
    if (!body?.entry?.length) return [];
    const metaHash = hashRawBody(req.rawBody ?? JSON.stringify(body));
    const out: ParsedIngress[] = [];

    for (const entry of body.entry) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const inbox = value?.metadata?.display_phone_number ?? value?.metadata?.phone_number_id;
        for (const msg of value?.messages ?? []) {
          const text =
            msg.text?.body ??
            msg.button?.text ??
            msg.interactive?.button_reply?.title ??
            undefined;
          const mediaId = msg.image?.id ?? msg.audio?.id ?? msg.document?.id ?? msg.video?.id;
          out.push({
            peerHandle: msg.from,
            inboxHandle: inbox,
            draft: {
              channel: "whatsapp",
              providerMessageId: msg.id,
              threadKey: "",
              sentAt: msg.timestamp
                ? new Date(Number(msg.timestamp) * 1000).toISOString()
                : new Date().toISOString(),
              fromRef: "",
              toRef: "",
              contentType: mediaId && !text ? "media_ref" : "text",
              plaintextBody: text,
              mediaRef: mediaId,
              rawProviderMetaHash: metaHash,
            },
          });
        }
      }
    }
    return out;
  }

  async send(packet: OutboundPacket): Promise<{ providerMessageId: string }> {
    if (!this.live) {
      return { providerMessageId: `wa-stub-${packet.threadId}-${Date.now()}` };
    }
    const to = (packet.peerHandle ?? "").replace(/\D/g, "");
    if (!to) throw new Error("whatsapp_missing_peer_handle");

    const version = this.opts.graphVersion ?? "v18.0";
    const url = `https://graph.facebook.com/${version}/${this.opts.phoneNumberId}/messages`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.opts.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body: packet.plaintextBody },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`whatsapp_graph_${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { messages?: Array<{ id?: string }> };
    const id = data.messages?.[0]?.id ?? `wa-${Date.now()}`;
    return { providerMessageId: id };
  }
}

type WhatsAppWebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messaging_product?: string;
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        messages?: Array<{
          from: string;
          id: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: { button_reply?: { title?: string } };
          image?: { id?: string };
          audio?: { id?: string };
          document?: { id?: string };
          video?: { id?: string };
        }>;
      };
    }>;
  }>;
};
