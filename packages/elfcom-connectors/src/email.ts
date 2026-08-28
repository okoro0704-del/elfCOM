import { createHmac } from "node:crypto";
import type { OutboundPacket } from "@elfcom/contract";
import {
  type ConnectorHttpRequest,
  type IChannelConnector,
  type ParsedIngress,
  hashRawBody,
  headerGet,
  normalizeEmailHandle,
  timingSafeEqualStr,
} from "@elfcom/connectors-core";

export type EmailConnectorOptions = {
  /** HMAC secret for ESP/IMAP bridge webhooks (header X-ElfCom-Email-Signature). */
  inboundSecret?: string;
  /** SendGrid API key for live HTTP delivery */
  sendgridApiKey?: string;
  /** From address for outbound */
  fromAddress?: string;
  /** Optional SMTP URL (nodemailer) — used when SendGrid unset */
  smtpUrl?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Email ingress via ESP webhook + live SendGrid (or SMTP) outbound.
 */
export class EmailConnector implements IChannelConnector {
  readonly channel = "email" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: EmailConnectorOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get live(): boolean {
    return Boolean(
      (this.opts.sendgridApiKey && this.opts.fromAddress) ||
        (this.opts.smtpUrl && this.opts.fromAddress),
    );
  }

  async verifyWebhook(req: ConnectorHttpRequest): Promise<boolean> {
    if (!this.opts.inboundSecret) return true;
    const sig = headerGet(req.headers, "x-elfcom-email-signature");
    if (!sig || !req.rawBody) return false;
    const expected = createHmac("sha256", this.opts.inboundSecret).update(req.rawBody).digest("hex");
    return timingSafeEqualStr(sig, expected);
  }

  async parseIngress(req: ConnectorHttpRequest): Promise<ParsedIngress[]> {
    const body = req.body as EmailInboundBody | undefined;
    if (!body?.from || !body?.to) return [];
    const from = normalizeEmailHandle(extractAddress(body.from));
    const to = normalizeEmailHandle(extractAddress(body.to));
    const text = body.text ?? stripHtml(body.html ?? "") ?? body.subject ?? "";

    return [
      {
        peerHandle: from,
        inboxHandle: to,
        draft: {
          channel: "email",
          providerMessageId: body.messageId ?? `email-${hashRawBody(from + to + text).slice(0, 16)}`,
          threadKey: "",
          sentAt: body.date ? new Date(body.date).toISOString() : new Date().toISOString(),
          fromRef: "",
          toRef: "",
          contentType: "text",
          plaintextBody: text.slice(0, 4000),
          rawProviderMetaHash: hashRawBody(req.rawBody ?? JSON.stringify(body)),
        },
      },
    ];
  }

  async send(packet: OutboundPacket): Promise<{ providerMessageId: string }> {
    if (!this.live) {
      return { providerMessageId: `email-stub-${packet.threadId}-${Date.now()}` };
    }
    const to = packet.peerHandle ? normalizeEmailHandle(extractAddress(packet.peerHandle)) : "";
    if (!to) throw new Error("email_missing_peer_handle");
    const from = this.opts.fromAddress!;

    if (this.opts.sendgridApiKey) {
      return this.sendViaSendGrid(from, to, packet.plaintextBody);
    }
    return this.sendViaSmtp(from, to, packet.plaintextBody);
  }

  private async sendViaSendGrid(
    from: string,
    to: string,
    body: string,
  ): Promise<{ providerMessageId: string }> {
    const res = await this.fetchImpl("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.opts.sendgridApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject: "ElfCom message",
        content: [{ type: "text/plain", value: body }],
      }),
    });
    if (!res.ok && res.status !== 202) {
      const text = await res.text();
      throw new Error(`sendgrid_${res.status}: ${text.slice(0, 200)}`);
    }
    const msgId = res.headers.get("x-message-id") ?? `sg-${Date.now()}`;
    return { providerMessageId: msgId };
  }

  private async sendViaSmtp(
    from: string,
    to: string,
    body: string,
  ): Promise<{ providerMessageId: string }> {
    try {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport(this.opts.smtpUrl!);
      const info = await transport.sendMail({
        from,
        to,
        subject: "ElfCom message",
        text: body,
      });
      return { providerMessageId: String(info.messageId ?? `smtp-${Date.now()}`) };
    } catch (err) {
      throw new Error(
        `smtp_send_failed: ${err instanceof Error ? err.message : "unknown"} (install nodemailer for SMTP)`,
      );
    }
  }
}

type EmailInboundBody = {
  from: string;
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  messageId?: string;
  date?: string;
};

function extractAddress(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m?.[1] ?? raw).trim();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
