import type { OutboundPacket } from "@elfcom/contract";
import {
  type ConnectorHttpRequest,
  type IChannelConnector,
  type ParsedIngress,
  hashRawBody,
  headerGet,
  normalizeTelegramHandle,
  timingSafeEqualStr,
} from "@elfcom/connectors-core";

export type TelegramConnectorOptions = {
  /** X-Telegram-Bot-Api-Secret-Token */
  webhookSecret?: string;
  /** Bot token for live sendMessage */
  botToken?: string;
  fetchImpl?: typeof fetch;
};

/** Telegram Bot API webhook + live sendMessage. */
export class TelegramConnector implements IChannelConnector {
  readonly channel = "telegram" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: TelegramConnectorOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get live(): boolean {
    return Boolean(this.opts.botToken);
  }

  async verifyWebhook(req: ConnectorHttpRequest): Promise<boolean> {
    if (!this.opts.webhookSecret) return true;
    const token = headerGet(req.headers, "x-telegram-bot-api-secret-token");
    if (!token) return false;
    return timingSafeEqualStr(token, this.opts.webhookSecret);
  }

  async parseIngress(req: ConnectorHttpRequest): Promise<ParsedIngress[]> {
    const update = req.body as TelegramUpdate | undefined;
    const msg = update?.message ?? update?.edited_message ?? update?.channel_post;
    if (!msg?.chat) return [];

    const peer = normalizeTelegramHandle(msg.chat.id, msg.from?.id);
    const text = msg.text ?? msg.caption;
    const mediaId =
      msg.photo?.[msg.photo.length - 1]?.file_id ??
      msg.document?.file_id ??
      msg.audio?.file_id ??
      msg.video?.file_id;

    return [
      {
        peerHandle: peer,
        inboxHandle: update?.message ? "bot" : undefined,
        draft: {
          channel: "telegram",
          providerMessageId: String(msg.message_id),
          threadKey: "",
          sentAt: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
          fromRef: "",
          toRef: "",
          contentType: mediaId && !text ? "media_ref" : "text",
          plaintextBody: text,
          mediaRef: mediaId,
          rawProviderMetaHash: hashRawBody(req.rawBody ?? JSON.stringify(update)),
        },
      },
    ];
  }

  async send(packet: OutboundPacket): Promise<{ providerMessageId: string }> {
    if (!this.live) {
      return { providerMessageId: `tg-stub-${packet.threadId}-${Date.now()}` };
    }
    const chatId = resolveTelegramChatId(packet.peerHandle);
    if (!chatId) throw new Error("telegram_missing_chat_id");

    const url = `https://api.telegram.org/bot${this.opts.botToken}/sendMessage`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: packet.plaintextBody,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`telegram_api_${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { result?: { message_id?: number } };
    return {
      providerMessageId: String(data.result?.message_id ?? `tg-${Date.now()}`),
    };
  }
}

function resolveTelegramChatId(peerHandle?: string): string | null {
  if (!peerHandle) return null;
  if (peerHandle.startsWith("telegram:chat:")) return peerHandle.slice("telegram:chat:".length);
  if (peerHandle.startsWith("telegram:user:")) return peerHandle.slice("telegram:user:".length);
  if (/^-?\d+$/.test(peerHandle)) return peerHandle;
  return peerHandle;
}

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
};

type TelegramMessage = {
  message_id: number;
  date?: number;
  text?: string;
  caption?: string;
  chat: { id: number | string; type?: string };
  from?: { id: number | string };
  photo?: Array<{ file_id: string }>;
  document?: { file_id: string };
  audio?: { file_id: string };
  video?: { file_id: string };
};
