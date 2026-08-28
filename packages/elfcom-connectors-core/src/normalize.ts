import { randomUUID, timingSafeEqual } from "node:crypto";
import type { ElfComChannel, NormalizedIngressPacket } from "@elfcom/contract";
import { blindIndexHandle, deriveOmniThreadId, sha256Hex } from "@elfcom/crypto";
import type { ParsedIngress } from "./types.js";

export function headerGet(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) return undefined;
  const v = headers[key];
  return Array.isArray(v) ? v[0] : v;
}

export function queryGet(
  query: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = query[name];
  return Array.isArray(v) ? v[0] : v;
}

export function hashRawBody(raw?: Buffer | string): string {
  if (!raw) return sha256Hex("");
  return sha256Hex(typeof raw === "string" ? raw : raw);
}

export function normalizeWhatsAppHandle(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function normalizeEmailHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizeTelegramHandle(chatId: string | number, userId?: string | number): string {
  if (userId != null) return `telegram:user:${userId}`;
  return `telegram:chat:${chatId}`;
}

export function normalizeInstagramHandle(scopedId: string): string {
  return `ig:${scopedId}`;
}

export function normalizeXHandle(userId: string): string {
  return `x:${userId}`;
}

export function opaqueRef(channel: ElfComChannel, blind: string): string {
  return `ref:${channel}:${blind.slice(0, 16)}`;
}

/**
 * Complete a ParsedIngress into a NormalizedIngressPacket once owner is known.
 */
export function finalizePacket(
  masterKey: Buffer,
  parsed: ParsedIngress,
  ownerTrustId: string,
): NormalizedIngressPacket {
  const channel = parsed.draft.channel;
  const peerNorm = normalizeHandleForChannel(channel, parsed.peerHandle);
  const peerBlind = blindIndexHandle(masterKey, channel, peerNorm);
  const ownerBlind = blindIndexHandle(masterKey, channel, `owner:${ownerTrustId}`);
  const threadKey =
    parsed.draft.threadKey ||
    `omni:${channel}:${ownerBlind.slice(0, 12)}:${peerBlind.slice(0, 12)}`;
  const threadId = deriveOmniThreadId(channel, ownerBlind, peerBlind);

  let inboxRef = parsed.draft.toRef;
  if (parsed.inboxHandle) {
    const inboxBlind = blindIndexHandle(
      masterKey,
      channel,
      normalizeHandleForChannel(channel, parsed.inboxHandle),
    );
    inboxRef = opaqueRef(channel, inboxBlind);
  }

  return {
    packetId: parsed.draft.packetId ?? randomUUID(),
    channel,
    providerMessageId: parsed.draft.providerMessageId,
    ownerTrustId,
    tenantId: parsed.draft.tenantId,
    threadKey: threadId,
    sentAt: parsed.draft.sentAt,
    fromRef: opaqueRef(channel, peerBlind),
    toRef: inboxRef || opaqueRef(channel, ownerBlind),
    contentType: parsed.draft.contentType,
    plaintextBody: parsed.draft.plaintextBody,
    mediaRef: parsed.draft.mediaRef,
    rawProviderMetaHash: parsed.draft.rawProviderMetaHash,
  };
}

export function normalizeHandleForChannel(channel: ElfComChannel, handle: string): string {
  switch (channel) {
    case "whatsapp":
      return normalizeWhatsAppHandle(handle);
    case "email":
      return normalizeEmailHandle(handle);
    case "telegram":
      return handle.startsWith("telegram:") ? handle : normalizeTelegramHandle(handle);
    case "instagram":
      return handle.startsWith("ig:") ? handle : normalizeInstagramHandle(handle);
    case "x":
      return handle.startsWith("x:") ? handle : normalizeXHandle(handle);
    default:
      return handle.trim().toLowerCase();
  }
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
