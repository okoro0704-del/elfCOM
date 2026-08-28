/**
 * ElfCom wire + port types.
 * Mirrors LifeOS `IElfComMessagingProvider` (`apps/lifeos-api/src/ports/elfcom.ts`).
 */

/**
 * Channel identifiers across pillars:
 * - dm/bus: native + ecosystem (Pillars 1–2)
 * - whatsapp|instagram|x|telegram|email: omnichannel (Pillar 3)
 */
export type ElfComChannel =
  | "dm"
  | "bus"
  | "whatsapp"
  | "instagram"
  | "x"
  | "telegram"
  | "email";

export type ElfComThread = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  unreadCount: number;
  participants?: string[];
  /** Omnichannel origin (Pillar 3). */
  channel?: ElfComChannel;
  /** Opaque peer ref — never email/phone plaintext. */
  peerRef?: string;
};

export type ElfComMessage = {
  id: string;
  threadId: string;
  body: string;
  senderId: string;
  createdAt: string;
  channel?: ElfComChannel;
  direction?: "inbound" | "outbound";
};

export interface IElfComMessagingProvider {
  readonly nodeId: "elfcom";
  readonly bound: boolean;
  listThreads(ownerTrustId: string): Promise<ElfComThread[]>;
  getThread(ownerTrustId: string, threadId: string): Promise<ElfComThread | null>;
  listMessages(ownerTrustId: string, threadId: string): Promise<ElfComMessage[]>;
  sendMessage(input: {
    ownerTrustId: string;
    threadId: string;
    body: string;
  }): Promise<ElfComMessage>;
}

/** Platform pillars — used for feature flags and tenancy routing. */
export type ElfComPillar = "consumer" | "ecosystem" | "omnichannel" | "baas";

/** Normalized ingress before seal (plaintext lives only in RAM). */
export type NormalizedIngressPacket = {
  packetId: string;
  channel: ElfComChannel;
  providerMessageId: string;
  ownerTrustId: string;
  /** Pillar 4 tenant namespace when applicable. */
  tenantId?: string;
  threadKey: string;
  sentAt: string;
  fromRef: string;
  toRef: string;
  contentType: "text" | "media_ref" | "system";
  plaintextBody?: string;
  mediaRef?: string;
  rawProviderMetaHash: string;
};

/** AES-GCM sealed blob (base64 fields for JSON transport). */
export type SealedBlob = {
  ciphertext: string;
  nonce: string;
  kid: string;
  aadHash: string;
};

export type CapabilityJwtClaims = {
  iss: string;
  aud: "elfcom" | string;
  sub: string;
  scp: string[];
  sid: string;
  zk_bind: string;
  exp: number;
  iat?: number;
};

export type SessionBindRequest = {
  sid: string;
  ownerTrustId: string;
  zk_bind: string;
  /** Raw 32-byte session key, base64 — RAM only on the node. */
  sessionKeyBase64: string;
  ttlSeconds?: number;
};

export const ELFCOM_SCOPES = [
  "thread:read",
  "thread:write",
  "message:send",
  "events:subscribe",
  "session:bind",
  "channel:link",
] as const;

export type ElfComScope = (typeof ELFCOM_SCOPES)[number];

/** Outbound packet for connector send(). */
export type OutboundPacket = {
  channel: ElfComChannel;
  ownerTrustId: string;
  threadId: string;
  peerHandle?: string;
  peerRef: string;
  plaintextBody: string;
  providerThreadHint?: string;
};

export type ChannelLinkRequest = {
  channel: ElfComChannel;
  /** Raw handle — accepted only over authenticated session; stored sealed/blind. */
  handle: string;
};

/** AAD mirrored to clients for envelope open (must match server encodeAad). */
export type SealAadWire = {
  ownerTrustId: string;
  threadId: string;
  messageId: string;
  channel: string;
  createdAt: string;
};

/** Session-rewrapped message for client-side open (console / Pillar 1). */
export type SealedMessageEnvelope = {
  id: string;
  threadId: string;
  senderId: string;
  createdAt: string;
  channel?: ElfComChannel;
  direction?: "inbound" | "outbound";
  bodyCipher: SealedBlob;
  aad: SealAadWire;
};

export type SealedThreadEnvelope = {
  id: string;
  updatedAt: string;
  unreadCount: number;
  participants?: string[];
  channel?: ElfComChannel;
  peerRef?: string;
  titleCipher?: SealedBlob;
  titleAad?: SealAadWire;
  previewCipher?: SealedBlob;
  previewAad?: SealAadWire;
};

/** Primitive outbound envelope (LifeOS / HospitalityOS / console). */
export type PrimitiveSendEnvelope = {
  /** Owner / tenant subject (TrustID). */
  recipientId: string;
  body: string;
  threadId?: string;
  /** Preferred channel; router may fall back. */
  channel?: ElfComChannel;
  peerHandle?: string;
  peerRef?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
  /** Override default fallback chain. */
  fallbackChannels?: ElfComChannel[];
};

export type PrimitiveBatchRequest = {
  messages: PrimitiveSendEnvelope[];
};

/** Realtime bus event types. */
export type ElfComRealtimeEventType =
  | "message.created"
  | "message.delivered"
  | "thread.updated"
  | "channel.linked";

export type ElfComRealtimeEvent = {
  typ: ElfComRealtimeEventType;
  userId: string;
  tenantId?: string;
  threadId?: string;
  messageId?: string;
  channel?: ElfComChannel;
  ts: string;
  /** Opaque meta only — never plaintext body. */
  meta?: Record<string, unknown>;
};
