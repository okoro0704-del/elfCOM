/**
 * RouterService — outbound channel routing with fallback + exponential backoff.
 * Does not own sealing; MessagingService persists, then calls route().
 */
import type { ElfComChannel, OutboundPacket } from "@elfcom/contract";
import type { ConnectorRegistry } from "@elfcom/connectors-core";

export type OutboundEnvelope = {
  recipientId: string;
  body: string;
  threadId: string;
  channel?: ElfComChannel;
  peerHandle?: string;
  peerRef?: string;
  providerThreadHint?: string;
  metadata?: Record<string, unknown>;
  fallbackChannels?: ElfComChannel[];
};

export type RouteAttempt = {
  channel: ElfComChannel;
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  attempt: number;
};

export type RouteResult = {
  ok: boolean;
  channel?: ElfComChannel;
  providerMessageId?: string;
  attempts: RouteAttempt[];
};

export type SendFn = (packet: OutboundPacket) => Promise<{ providerMessageId: string }>;

const DEFAULT_FALLBACK: ElfComChannel[] = [
  "whatsapp",
  "telegram",
  "email",
  "instagram",
  "x",
  "dm",
  "bus",
];

export type RouterServiceOptions = {
  registry?: ConnectorRegistry | null;
  /** Inject senders for tests (channel → send). */
  senders?: Partial<Record<ElfComChannel, SendFn>>;
  maxAttemptsPerChannel?: number;
  baseBackoffMs?: number;
  /** Sleep override for tests. */
  sleep?: (ms: number) => Promise<void>;
};

export class RouterService {
  private registry: ConnectorRegistry | null;
  private readonly senders: Partial<Record<ElfComChannel, SendFn>>;
  private readonly maxAttemptsPerChannel: number;
  private readonly baseBackoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: RouterServiceOptions = {}) {
    this.registry = opts.registry ?? null;
    this.senders = opts.senders ?? {};
    this.maxAttemptsPerChannel = opts.maxAttemptsPerChannel ?? 3;
    this.baseBackoffMs = opts.baseBackoffMs ?? 50;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  setRegistry(registry: ConnectorRegistry | null) {
    this.registry = registry;
  }

  /** Test helper — replace injected senders. */
  setSenders(senders: Partial<Record<ElfComChannel, SendFn>>) {
    for (const key of Object.keys(this.senders) as ElfComChannel[]) {
      delete this.senders[key];
    }
    Object.assign(this.senders, senders);
  }

  /**
   * Route envelope: try preferred channel, then fallback chain.
   * Exponential backoff between attempts on the same channel.
   */
  async route(envelope: OutboundEnvelope): Promise<RouteResult> {
    const chain = this.buildChain(envelope.channel, envelope.fallbackChannels);
    const attempts: RouteAttempt[] = [];

    for (const channel of chain) {
      const send = this.resolveSender(channel);
      if (!send) {
        attempts.push({
          channel,
          ok: false,
          error: "connector_unavailable",
          attempt: 0,
        });
        continue;
      }

      for (let attempt = 1; attempt <= this.maxAttemptsPerChannel; attempt++) {
        try {
          const packet: OutboundPacket = {
            channel,
            ownerTrustId: envelope.recipientId,
            threadId: envelope.threadId,
            peerHandle: envelope.peerHandle,
            peerRef: envelope.peerRef ?? "",
            plaintextBody: envelope.body,
            providerThreadHint: envelope.providerThreadHint,
          };
          const result = await send(packet);
          attempts.push({
            channel,
            ok: true,
            providerMessageId: result.providerMessageId,
            attempt,
          });
          return {
            ok: true,
            channel,
            providerMessageId: result.providerMessageId,
            attempts,
          };
        } catch (err) {
          const error = err instanceof Error ? err.message : "send_failed";
          attempts.push({ channel, ok: false, error, attempt });
          if (attempt < this.maxAttemptsPerChannel) {
            const backoff = this.baseBackoffMs * 2 ** (attempt - 1);
            await this.sleep(backoff);
          }
        }
      }
    }

    return { ok: false, attempts };
  }

  private buildChain(
    preferred?: ElfComChannel,
    override?: ElfComChannel[],
  ): ElfComChannel[] {
    const base = override?.length ? [...override] : [...DEFAULT_FALLBACK];
    if (!preferred) return base;
    return [preferred, ...base.filter((c) => c !== preferred)];
  }

  private resolveSender(channel: ElfComChannel): SendFn | null {
    if (this.senders[channel]) return this.senders[channel]!;
    // Native / bus: message already persisted in-node — treat as delivered.
    if (channel === "dm" || channel === "bus") {
      return async () => ({ providerMessageId: `local-${channel}-${Date.now()}` });
    }
    const connector = this.registry?.get(channel);
    if (connector?.send) {
      return (packet) => connector.send!(packet);
    }
    return null;
  }
}

export const routerService = new RouterService();
