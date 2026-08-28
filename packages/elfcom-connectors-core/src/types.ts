import type { ElfComChannel, NormalizedIngressPacket, OutboundPacket } from "@elfcom/contract";

export type ConnectorHttpRequest = {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  /** Raw body bytes when available (signature verify). */
  rawBody?: Buffer;
  /** Parsed JSON body when Content-Type is JSON. */
  body?: unknown;
};

export type ConnectorVerifyResult =
  | { kind: "challenge"; status: number; body: string; contentType?: string }
  | { kind: "ok"; status?: number };

export type ParsedIngress = {
  draft: Omit<NormalizedIngressPacket, "ownerTrustId" | "packetId"> & {
    ownerTrustId?: string;
    packetId?: string;
  };
  /** Raw peer handle for blind-index owner resolve (never persisted as plaintext). */
  peerHandle: string;
  inboxHandle?: string;
};

export interface IChannelConnector {
  readonly channel: ElfComChannel;
  verifyWebhook(req: ConnectorHttpRequest): Promise<boolean>;
  handleVerification?(req: ConnectorHttpRequest): Promise<ConnectorVerifyResult | null>;
  parseIngress(req: ConnectorHttpRequest): Promise<ParsedIngress[]>;
  send?(packet: OutboundPacket): Promise<{ providerMessageId: string }>;
}

export type ConnectorRegistryOptions = {
  connectors: IChannelConnector[];
};
