import { randomUUID } from "node:crypto";
import type {
  ElfComChannel,
  ElfComMessage,
  ElfComThread,
  NormalizedIngressPacket,
  SealedMessageEnvelope,
  SealedThreadEnvelope,
} from "@elfcom/contract";
import {
  finalizePacket,
  normalizeHandleForChannel,
  type ConnectorRegistry,
  type ParsedIngress,
} from "@elfcom/connectors-core";
import {
  SessionBinder,
  SessionBindError,
  blindIndexHandle,
  deriveUserKey,
  openUtf8,
  parseMasterKey,
  seal,
  type P2pEnvelope,
  type SealAad,
} from "@elfcom/crypto";
import { config } from "../config.js";
import {
  persistAudit,
  persistChannelLink,
  persistMessage,
  persistOutbox,
  persistThread,
} from "../persistence/postgres.js";
import { ChannelLinkStore } from "../store/channel-links.js";
import { MemoryMessageStore } from "../store/memory-store.js";
import { routerService } from "./router.service.js";
import { webSocketService } from "./websocket.service.js";

const REDACTED = "";

export class MessagingService {
  readonly binder: SessionBinder;
  readonly store = new MemoryMessageStore();
  readonly links = new ChannelLinkStore();
  private readonly masterKey: Buffer;
  private registry: ConnectorRegistry | null = null;

  constructor() {
    this.masterKey = parseMasterKey(config.nodeMasterKey);
    this.binder = new SessionBinder({
      aud: config.jwtAud,
      defaultTtlMs: config.sessionBindTtlSeconds * 1000,
    });
  }

  setConnectorRegistry(registry: ConnectorRegistry) {
    this.registry = registry;
    routerService.setRegistry(registry);
  }

  private userKey(ownerTrustId: string) {
    return deriveUserKey(this.masterKey, ownerTrustId);
  }

  bindSession(input: {
    sid: string;
    ownerTrustId: string;
    zk_bind: string;
    sessionKeyBase64: string;
    ttlSeconds?: number;
  }) {
    const sessionKey = Buffer.from(input.sessionKeyBase64, "base64");
    this.binder.bind({
      sid: input.sid,
      ownerTrustId: input.ownerTrustId,
      zk_bind: input.zk_bind,
      sessionKey,
      ttlMs: (input.ttlSeconds ?? config.sessionBindTtlSeconds) * 1000,
      aud: config.jwtAud,
    });
  }

  unbindSession(sid: string) {
    this.binder.unbind(sid);
  }

  registerPeerPublicKey(ownerTrustId: string, publicKeyPem: string) {
    this.binder.registerPeerPublicKey(ownerTrustId, publicKeyPem);
  }

  linkChannel(input: {
    ownerTrustId: string;
    channel: ElfComChannel;
    handle: string;
  }) {
    const normalized = normalizeHandleForChannel(input.channel, input.handle);
    const blind = blindIndexHandle(this.masterKey, input.channel, normalized);
    const aad: SealAad = {
      ownerTrustId: input.ownerTrustId,
      threadId: `link:${input.channel}`,
      messageId: blind,
      channel: input.channel,
      createdAt: new Date().toISOString(),
    };
    const handleCipher = seal(normalized, this.userKey(input.ownerTrustId), aad, `user:${input.ownerTrustId}`);
    this.links.upsert({
      ownerTrustId: input.ownerTrustId,
      channel: input.channel,
      handleBlindIndex: blind,
      handleCipherJson: JSON.stringify(handleCipher),
      createdAt: aad.createdAt,
    });
    void persistChannelLink({
      ownerTrustId: input.ownerTrustId,
      channel: input.channel,
      handleBlindIndex: blind,
      handleCipherJson: JSON.stringify(handleCipher),
    });
    void persistAudit({
      ownerTrustId: input.ownerTrustId,
      op: "channel.linked",
      channel: input.channel,
    });
    webSocketService.emit({
      typ: "channel.linked",
      userId: input.ownerTrustId,
      channel: input.channel,
      ts: new Date().toISOString(),
      meta: { handleBlindIndex: blind },
    });
    return { channel: input.channel, handleBlindIndex: blind };
  }

  /**
   * Ingress path: resolve owner → finalize packet → seal with user key → unified thread.
   */
  ingestParsed(channel: ElfComChannel, parsedList: ParsedIngress[]): { accepted: number; dropped: number } {
    let accepted = 0;
    let dropped = 0;
    for (const parsed of parsedList) {
      const owner = this.resolveOwner(channel, parsed);
      if (!owner) {
        dropped += 1;
        continue;
      }
      const packet = finalizePacket(this.masterKey, parsed, owner);
      this.persistInbound(packet, parsed.peerHandle);
      webSocketService.emit({
        typ: "message.created",
        userId: owner,
        threadId: packet.threadKey,
        messageId: packet.packetId,
        channel: packet.channel,
        ts: packet.sentAt,
        meta: { direction: "inbound" },
      });
      webSocketService.emit({
        typ: "thread.updated",
        userId: owner,
        threadId: packet.threadKey,
        channel: packet.channel,
        ts: packet.sentAt,
      });
      accepted += 1;
    }
    return { accepted, dropped };
  }

  listThreads(
    auth: { sub: string; sid: string; zk_bind: string },
    filter?: { channel?: string },
  ): ElfComThread[] {
    this.assertOwner(auth);
    const bound = this.tryRequire(auth);
    return this.store.listThreads(auth.sub, filter).map((t) => this.toThreadDto(t, bound, auth));
  }

  getThread(
    auth: { sub: string; sid: string; zk_bind: string },
    threadId: string,
  ): ElfComThread | null {
    this.assertOwner(auth);
    const t = this.store.getThread(auth.sub, threadId);
    if (!t) return null;
    const bound = this.tryRequire(auth);
    return this.toThreadDto(t, bound, auth);
  }

  listMessages(
    auth: { sub: string; sid: string; zk_bind: string },
    threadId: string,
  ): ElfComMessage[] {
    this.assertOwner(auth);
    const binding = this.binder.requireOpen({
      sid: auth.sid,
      ownerTrustId: auth.sub,
      zk_bind: auth.zk_bind,
    });
    const thread = this.store.getThread(auth.sub, threadId);
    if (!thread) return [];
    return this.store.listMessages(auth.sub, threadId).map((m) => ({
      id: m.id,
      threadId: m.threadId,
      body: this.openBody(m, binding.sessionKey, auth.zk_bind, auth.sid),
      senderId: m.senderId,
      createdAt: m.createdAt,
      channel: m.channel as ElfComChannel,
      direction: m.direction,
    }));
  }

  /**
   * Rewrap durable ciphertext to the active session key for client-side open.
   * Plaintext exists only briefly in node RAM during rewrap — never logged.
   */
  listMessageEnvelopes(
    auth: { sub: string; sid: string; zk_bind: string },
    threadId: string,
  ): SealedMessageEnvelope[] {
    this.assertOwner(auth);
    const binding = this.binder.requireOpen({
      sid: auth.sid,
      ownerTrustId: auth.sub,
      zk_bind: auth.zk_bind,
    });
    const thread = this.store.getThread(auth.sub, threadId);
    if (!thread) return [];
    return this.store.listMessages(auth.sub, threadId).map((m) => {
      const plaintext = this.openBody(m, binding.sessionKey, auth.zk_bind, auth.sid);
      const aad: SealAad = {
        ownerTrustId: m.ownerTrustId,
        threadId: m.threadId,
        messageId: m.id,
        channel: m.channel,
        createdAt: m.createdAt,
      };
      const bodyCipher = seal(plaintext, binding.sessionKey, aad, `sess:${auth.sid}`);
      return {
        id: m.id,
        threadId: m.threadId,
        senderId: m.senderId,
        createdAt: m.createdAt,
        channel: m.channel as ElfComChannel,
        direction: m.direction,
        bodyCipher,
        aad,
      };
    });
  }

  listThreadEnvelopes(
    auth: { sub: string; sid: string; zk_bind: string },
    filter?: { channel?: string },
  ): SealedThreadEnvelope[] {
    this.assertOwner(auth);
    const binding = this.binder.requireOpen({
      sid: auth.sid,
      ownerTrustId: auth.sub,
      zk_bind: auth.zk_bind,
    });
    return this.store.listThreads(auth.sub, filter).map((t) => {
      const title = this.openTitle(t, binding.sessionKey);
      const titleAad = titleAadFields(t);
      const titleCipher = seal(title, binding.sessionKey, titleAad, `sess:${auth.sid}`);
      const msgs = this.store.listMessages(auth.sub, t.id);
      const last = msgs[msgs.length - 1];
      let previewCipher: ReturnType<typeof seal> | undefined;
      let previewAad: SealAad | undefined;
      if (last) {
        const preview = this.openBody(last, binding.sessionKey, auth.zk_bind, auth.sid);
        previewAad = {
          ownerTrustId: last.ownerTrustId,
          threadId: last.threadId,
          messageId: last.id,
          channel: last.channel,
          createdAt: last.createdAt,
        };
        previewCipher = seal(preview, binding.sessionKey, previewAad, `sess:${auth.sid}`);
      }
      return {
        id: t.id,
        updatedAt: t.updatedAt,
        unreadCount: t.unreadCount,
        participants: t.participants,
        channel: t.channel as ElfComChannel,
        peerRef: t.peerRef,
        titleCipher,
        titleAad,
        previewCipher,
        previewAad,
      };
    });
  }

  async sendMessage(
    auth: { sub: string; sid: string; zk_bind: string },
    input: {
      threadId: string;
      body: string;
      channel?: ElfComChannel;
      peerHandle?: string;
      peerRef?: string;
      fallbackChannels?: ElfComChannel[];
      tenantId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ElfComMessage & { route?: import("./router.service.js").RouteResult }> {
    this.assertOwner(auth);
    this.binder.requireOpen({
      sid: auth.sid,
      ownerTrustId: auth.sub,
      zk_bind: auth.zk_bind,
    });

    const threadId = input.threadId;
    let thread = this.store.getThread(auth.sub, threadId);
    const uk = this.userKey(auth.sub);
    const preferredChannel = input.channel ?? (thread?.channel as ElfComChannel | undefined) ?? "dm";

    if (!thread) {
      const titleCreatedAt = new Date().toISOString();
      const titleAadFields: SealAad = {
        ownerTrustId: auth.sub,
        threadId,
        messageId: `${threadId}:title`,
        channel: preferredChannel,
        createdAt: titleCreatedAt,
      };
      const titleCipher = seal(
        preferredChannel === "dm" ? "Direct message" : `${preferredChannel} thread`,
        uk,
        titleAadFields,
        `user:${auth.sub}`,
      );
      thread = this.store.ensureThread({
        id: threadId,
        ownerTrustId: auth.sub,
        titleCipher,
        titleCreatedAt,
        titleSealMode: "user",
        channel: preferredChannel,
        peerRef: input.peerRef,
        participants: [auth.sub],
      });
      void persistThread({
        id: thread.id,
        ownerTrustId: thread.ownerTrustId,
        channel: thread.channel,
        peerRef: thread.peerRef,
        titleCipher: thread.titleCipher,
        titleCreatedAt: thread.titleCreatedAt,
        titleSealMode: thread.titleSealMode,
        peerHandleCipher: thread.peerHandleCipher,
        participants: thread.participants,
        unreadCount: thread.unreadCount,
      });
    }

    const messageId = randomUUID();
    const createdAt = new Date().toISOString();
    const aad: SealAad = {
      ownerTrustId: auth.sub,
      threadId,
      messageId,
      channel: thread.channel,
      createdAt,
    };

    const bodyCipher = seal(input.body, uk, aad, `user:${auth.sub}`);

    this.store.appendMessage({
      id: messageId,
      threadId,
      ownerTrustId: auth.sub,
      senderId: auth.sub,
      channel: thread.channel,
      createdAt,
      bodyCipher,
      sealMode: "user",
      direction: "outbound",
    });

    void persistMessage({
      id: messageId,
      threadId,
      ownerTrustId: auth.sub,
      senderId: auth.sub,
      channel: thread.channel,
      direction: "outbound",
      sealMode: "user",
      bodyCipher,
      createdAt,
    });

    let peerHandle = input.peerHandle;
    if (!peerHandle && thread.peerHandleCipher) {
      try {
        peerHandle = openUtf8(thread.peerHandleCipher, uk, {
          ownerTrustId: auth.sub,
          threadId: thread.id,
          messageId: `${thread.id}:peer`,
          channel: thread.channel,
          createdAt: thread.titleCreatedAt,
        });
      } catch {
        peerHandle = undefined;
      }
    }

    const route = await routerService.route({
      recipientId: auth.sub,
      body: input.body,
      threadId: thread.id,
      channel: (input.channel ?? thread.channel) as ElfComChannel,
      peerHandle,
      peerRef: input.peerRef ?? thread.peerRef,
      providerThreadHint: thread.providerThreadHint,
      metadata: input.metadata,
      fallbackChannels: input.fallbackChannels,
    });

    void persistOutbox({
      ownerTrustId: auth.sub,
      threadId: thread.id,
      messageId,
      channel: route.channel ?? thread.channel,
      status: route.ok ? "delivered" : "failed",
      attempts: route.attempts.length,
      lastError: route.ok ? undefined : route.attempts.map((a) => a.error).filter(Boolean).join("; "),
      providerMessageId: route.providerMessageId,
    });
    void persistAudit({
      ownerTrustId: auth.sub,
      op: route.ok ? "message.delivered" : "message.route_failed",
      channel: route.channel ?? thread.channel,
      threadId: thread.id,
      messageId,
      meta: { attempts: route.attempts.length },
    });

    webSocketService.emit({
      typ: "message.created",
      userId: auth.sub,
      tenantId: input.tenantId,
      threadId: thread.id,
      messageId,
      channel: (route.channel ?? thread.channel) as ElfComChannel,
      ts: createdAt,
      meta: { direction: "outbound" },
    });
    if (route.ok) {
      webSocketService.emit({
        typ: "message.delivered",
        userId: auth.sub,
        tenantId: input.tenantId,
        threadId: thread.id,
        messageId,
        channel: route.channel,
        ts: new Date().toISOString(),
        meta: { providerMessageId: route.providerMessageId },
      });
    }
    webSocketService.emit({
      typ: "thread.updated",
      userId: auth.sub,
      tenantId: input.tenantId,
      threadId: thread.id,
      channel: (route.channel ?? thread.channel) as ElfComChannel,
      ts: createdAt,
    });

    return {
      id: messageId,
      threadId,
      body: input.body,
      senderId: auth.sub,
      createdAt,
      channel: (route.channel ?? thread.channel) as ElfComChannel,
      direction: "outbound",
      route,
    };
  }

  /**
   * Primitive API entry — creates/uses thread then routes via RouterService.
   */
  async sendPrimitive(
    auth: { sub: string; sid: string; zk_bind: string },
    envelope: {
      recipientId: string;
      body: string;
      threadId?: string;
      channel?: ElfComChannel;
      peerHandle?: string;
      peerRef?: string;
      tenantId?: string;
      metadata?: Record<string, unknown>;
      p2p?: P2pEnvelope;
      fallbackChannels?: ElfComChannel[];
    },
  ) {
    const threadId = envelope.threadId ?? envelope.p2p?.threadId ?? `prim_${randomUUID()}`;

    // P2P DM: verify digital signature before RouterService dispatch.
    if (envelope.p2p) {
      if (envelope.p2p.fromTrustId !== auth.sub) {
        throw new SessionBindError("p2p_sender_mismatch", "P2P fromTrustId must match JWT sub");
      }
      if (envelope.p2p.threadId !== threadId) {
        throw new SessionBindError("p2p_thread_mismatch", "P2P threadId must match send threadId");
      }
      this.binder.requireP2pEnvelope(envelope.p2p);
    } else if (envelope.channel === "dm" && envelope.metadata?.p2pRequire === true) {
      throw new SessionBindError("p2p_required", "P2P signed envelope required for this DM");
    }

    const message = await this.sendMessage(auth, {
      threadId,
      body: envelope.body,
      channel: envelope.channel,
      peerHandle: envelope.peerHandle,
      peerRef: envelope.peerRef,
      fallbackChannels: envelope.fallbackChannels,
      tenantId: envelope.tenantId,
      metadata: envelope.metadata,
    });
    return { message, route: message.route };
  }

  private persistInbound(packet: NormalizedIngressPacket, peerHandle: string) {
    const uk = this.userKey(packet.ownerTrustId);
    const threadId = packet.threadKey;
    const titleCreatedAt = packet.sentAt;
    let thread = this.store.getThread(packet.ownerTrustId, threadId);

    if (!thread) {
      const titleAad: SealAad = {
        ownerTrustId: packet.ownerTrustId,
        threadId,
        messageId: `${threadId}:title`,
        channel: packet.channel,
        createdAt: titleCreatedAt,
      };
      const title = `${packet.channel} · ${packet.fromRef}`;
      const titleCipher = seal(title, uk, titleAad, `user:${packet.ownerTrustId}`);
      const peerAad: SealAad = {
        ownerTrustId: packet.ownerTrustId,
        threadId,
        messageId: `${threadId}:peer`,
        channel: packet.channel,
        createdAt: titleCreatedAt,
      };
      const peerHandleCipher = seal(
        normalizeHandleForChannel(packet.channel, peerHandle),
        uk,
        peerAad,
        `user:${packet.ownerTrustId}`,
      );
      thread = this.store.ensureThread({
        id: threadId,
        ownerTrustId: packet.ownerTrustId,
        titleCipher,
        titleCreatedAt,
        titleSealMode: "user",
        channel: packet.channel,
        peerRef: packet.fromRef,
        peerHandleCipher,
        participants: [packet.ownerTrustId, packet.fromRef],
      });
    }

    const messageId = packet.packetId;
    const aad: SealAad = {
      ownerTrustId: packet.ownerTrustId,
      threadId,
      messageId,
      channel: packet.channel,
      createdAt: packet.sentAt,
    };
    const body = packet.plaintextBody ?? (packet.mediaRef ? `[media:${packet.mediaRef}]` : "");
    const bodyCipher = seal(body, uk, aad, `user:${packet.ownerTrustId}`);

    this.store.appendMessage({
      id: messageId,
      threadId,
      ownerTrustId: packet.ownerTrustId,
      senderId: packet.fromRef,
      channel: packet.channel,
      createdAt: packet.sentAt,
      bodyCipher,
      sealMode: "user",
      direction: "inbound",
    });

    void persistThread({
      id: thread.id,
      ownerTrustId: thread.ownerTrustId,
      channel: thread.channel,
      peerRef: thread.peerRef,
      titleCipher: thread.titleCipher,
      titleCreatedAt: thread.titleCreatedAt,
      titleSealMode: thread.titleSealMode,
      peerHandleCipher: thread.peerHandleCipher,
      participants: thread.participants,
      unreadCount: thread.unreadCount,
    });
    void persistMessage({
      id: messageId,
      threadId,
      ownerTrustId: packet.ownerTrustId,
      senderId: packet.fromRef,
      channel: packet.channel,
      direction: "inbound",
      sealMode: "user",
      bodyCipher,
      createdAt: packet.sentAt,
    });
    void persistAudit({
      ownerTrustId: packet.ownerTrustId,
      op: "message.ingested",
      channel: packet.channel,
      threadId,
      messageId,
    });
  }

  private resolveOwner(channel: ElfComChannel, parsed: ParsedIngress): string | null {
    if (parsed.draft.ownerTrustId) return parsed.draft.ownerTrustId;
    const peerNorm = normalizeHandleForChannel(channel, parsed.peerHandle);
    const peerBlind = blindIndexHandle(this.masterKey, channel, peerNorm);
    const byPeer = this.links.resolve(channel, peerBlind);
    if (byPeer) return byPeer.ownerTrustId;

    if (parsed.inboxHandle) {
      const inboxNorm = normalizeHandleForChannel(channel, parsed.inboxHandle);
      const inboxBlind = blindIndexHandle(this.masterKey, channel, inboxNorm);
      const byInbox = this.links.resolve(channel, inboxBlind);
      if (byInbox) return byInbox.ownerTrustId;
    }

    if (config.devIngressOwner) return config.devIngressOwner;
    return null;
  }

  private toThreadDto(
    t: import("../store/memory-store.js").StoredThread,
    bound: { sessionKey: Buffer } | null,
    auth: { sub: string; sid: string; zk_bind: string },
  ): ElfComThread {
    let title = "Thread";
    let preview = REDACTED;
    if (bound) {
      try {
        title = this.openTitle(t, bound.sessionKey);
        const msgs = this.store.listMessages(auth.sub, t.id);
        const last = msgs[msgs.length - 1];
        if (last) {
          preview = this.openBody(last, bound.sessionKey, auth.zk_bind, auth.sid);
        }
      } catch {
        title = "Thread";
        preview = REDACTED;
      }
    }
    return {
      id: t.id,
      title,
      preview,
      updatedAt: t.updatedAt,
      unreadCount: t.unreadCount,
      participants: t.participants,
      channel: t.channel as ElfComChannel,
      peerRef: t.peerRef,
    };
  }

  private openTitle(
    t: import("../store/memory-store.js").StoredThread,
    sessionKey: Buffer,
  ): string {
    const aad = titleAad(t);
    if (t.titleSealMode === "user") {
      return openUtf8(t.titleCipher, this.userKey(t.ownerTrustId), aad);
    }
    return openUtf8(t.titleCipher, sessionKey, aad);
  }

  private openBody(
    m: {
      id: string;
      threadId: string;
      ownerTrustId: string;
      channel: string;
      createdAt: string;
      bodyCipher: import("@elfcom/contract").SealedBlob;
      sealMode: "session" | "user";
    },
    sessionKey: Buffer,
    zk_bind: string,
    sid: string,
  ): string {
    const aad: SealAad = {
      ownerTrustId: m.ownerTrustId,
      threadId: m.threadId,
      messageId: m.id,
      channel: m.channel,
      createdAt: m.createdAt,
    };
    if (m.sealMode === "session") {
      return this.binder.openWithSession(sid, m.bodyCipher, aad, zk_bind);
    }
    // Session bind authorizes open; crypto uses durable user wrap key.
    void sessionKey;
    return openUtf8(m.bodyCipher, this.userKey(m.ownerTrustId), aad);
  }

  private assertOwner(auth: { sub: string }) {
    if (!auth.sub) throw new Error("missing_sub");
  }

  private tryRequire(auth: { sid: string; sub: string; zk_bind: string }) {
    try {
      return this.binder.requireOpen({
        sid: auth.sid,
        ownerTrustId: auth.sub,
        zk_bind: auth.zk_bind,
      });
    } catch (err) {
      if (err instanceof SessionBindError) return null;
      throw err;
    }
  }
}

function titleAadFields(t: {
  ownerTrustId: string;
  id: string;
  channel: string;
  titleCreatedAt: string;
}): SealAad {
  return {
    ownerTrustId: t.ownerTrustId,
    threadId: t.id,
    messageId: `${t.id}:title`,
    channel: t.channel,
    createdAt: t.titleCreatedAt,
  };
}

function titleAad(t: {
  ownerTrustId: string;
  id: string;
  channel: string;
  titleCreatedAt: string;
}): SealAad {
  return titleAadFields(t);
}

export const messagingService = new MessagingService();
