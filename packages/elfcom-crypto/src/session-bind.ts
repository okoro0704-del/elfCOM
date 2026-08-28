import type { NormalizedIngressPacket, SealedBlob } from "@elfcom/contract";
import { openUtf8, seal, type SealAad } from "./seal.js";
import { computeZkBind } from "./keys.js";
import { P2pKeyExchange, type P2pEnvelope } from "./p2p.js";

export type SessionBinding = {
  sid: string;
  ownerTrustId: string;
  zkBind: string;
  /** 32-byte AES key — never persisted outside this map. */
  sessionKey: Buffer;
  expiresAt: number;
};

export type BindInput = {
  sid: string;
  ownerTrustId: string;
  zk_bind: string;
  sessionKey: Buffer;
  ttlMs?: number;
  /** Expected JWT audience used when computing zk_bind. */
  aud?: string;
};

const DEFAULT_TTL_MS = 24 * 60 * 60_000;
const REDACTED_PREVIEW = "";

/**
 * Ephemeral RAM-only ZK session binder.
 * Holds active session keys; seals/opens normalized packets in memory only.
 * Also hosts P2P peer public-key registry for DM signature verification.
 */
export class SessionBinder {
  private readonly store = new Map<string, SessionBinding>();
  private readonly defaultTtlMs: number;
  private readonly aud: string;
  readonly p2p = new P2pKeyExchange();

  constructor(opts?: { defaultTtlMs?: number; aud?: string }) {
    this.defaultTtlMs = opts?.defaultTtlMs ?? DEFAULT_TTL_MS;
    this.aud = opts?.aud ?? "elfcom";
  }

  private sweep(now = Date.now()) {
    for (const [sid, entry] of this.store) {
      if (entry.expiresAt <= now) {
        zeroKey(entry.sessionKey);
        this.store.delete(sid);
      }
    }
  }

  /**
   * Bind a ZK session key for `sid`.
   * Verifies `zk_bind` matches HMAC over the provided session key.
   */
  bind(input: BindInput): void {
    this.sweep();
    if (input.sessionKey.length !== 32) {
      throw new Error("session bind: sessionKey must be 32 bytes");
    }
    const expected = computeZkBind(input.sessionKey, {
      aud: input.aud ?? this.aud,
      sid: input.sid,
      ownerTrustId: input.ownerTrustId,
    });
    if (expected !== input.zk_bind) {
      throw new Error("session bind: zk_bind mismatch");
    }

    const existing = this.store.get(input.sid);
    if (existing) zeroKey(existing.sessionKey);

    const ttlMs = input.ttlMs ?? this.defaultTtlMs;
    this.store.set(input.sid, {
      sid: input.sid,
      ownerTrustId: input.ownerTrustId,
      zkBind: input.zk_bind,
      sessionKey: Buffer.from(input.sessionKey),
      expiresAt: Date.now() + ttlMs,
    });
  }

  unbind(sid: string): void {
    const entry = this.store.get(sid);
    if (!entry) return;
    zeroKey(entry.sessionKey);
    this.store.delete(sid);
  }

  get(sid: string): SessionBinding | null {
    this.sweep();
    const entry = this.store.get(sid);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.unbind(sid);
      return null;
    }
    return entry;
  }

  /** Authorize an open: sid must be bound, owner + zk_bind must match JWT claims. */
  requireOpen(input: {
    sid: string;
    ownerTrustId: string;
    zk_bind: string;
  }): SessionBinding {
    const binding = this.get(input.sid);
    if (!binding) {
      throw new SessionBindError("session_not_bound", "No active ZK session bind for sid");
    }
    if (binding.ownerTrustId !== input.ownerTrustId) {
      throw new SessionBindError("session_owner_mismatch", "Session bind owner mismatch");
    }
    if (binding.zkBind !== input.zk_bind) {
      throw new SessionBindError("zk_bind_mismatch", "zk_bind does not match active bind");
    }
    return binding;
  }

  /**
   * Seal a normalized ingress packet under the active session key.
   * Plaintext is read from the packet then discarded by the caller.
   */
  sealIngressPacket(
    sid: string,
    packet: NormalizedIngressPacket,
    meta: { threadId: string; messageId: string },
  ): SealedBlob {
    const binding = this.get(sid);
    if (!binding) {
      throw new SessionBindError("session_not_bound", "Cannot seal without active session bind");
    }
    if (binding.ownerTrustId !== packet.ownerTrustId) {
      throw new SessionBindError("session_owner_mismatch", "Packet owner does not match bind");
    }
    const body = packet.plaintextBody ?? "";
    const aad: SealAad = {
      ownerTrustId: packet.ownerTrustId,
      threadId: meta.threadId,
      messageId: meta.messageId,
      channel: packet.channel,
      createdAt: packet.sentAt,
    };
    return seal(body, binding.sessionKey, aad, `sess:${sid}`);
  }

  /** Open a sealed blob with the bound session key (in-memory only). */
  openWithSession(sid: string, blob: SealedBlob, aad: SealAad, zk_bind: string): string {
    const binding = this.requireOpen({
      sid,
      ownerTrustId: aad.ownerTrustId,
      zk_bind,
    });
    return openUtf8(blob, binding.sessionKey, aad);
  }

  /** Register a peer's TrustID device public key for P2P DM verification. */
  registerPeerPublicKey(ownerTrustId: string, publicKeyPem: string) {
    this.p2p.registerPublicKey(ownerTrustId, publicKeyPem);
  }

  /** Verify a signed P2P envelope before RouterService dispatch. */
  verifyP2pEnvelope(envelope: P2pEnvelope): boolean {
    return this.p2p.verifyEnvelope(envelope);
  }

  requireP2pEnvelope(envelope: P2pEnvelope): void {
    if (!this.verifyP2pEnvelope(envelope)) {
      throw new SessionBindError("p2p_signature_invalid", "P2P envelope signature verification failed");
    }
  }

  /** Preview helper — empty when unbound (never leak ciphertext as preview). */
  previewOrRedacted(sid: string | undefined, plaintext: string | null): string {
    if (!sid || !this.get(sid) || plaintext == null) return REDACTED_PREVIEW;
    return plaintext.length > 120 ? `${plaintext.slice(0, 117)}...` : plaintext;
  }

  size(): number {
    this.sweep();
    return this.store.size;
  }

  /** Test helper */
  clear(): void {
    for (const entry of this.store.values()) zeroKey(entry.sessionKey);
    this.store.clear();
    this.p2p.clear();
  }
}

export class SessionBindError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SessionBindError";
  }
}

function zeroKey(key: Buffer) {
  key.fill(0);
}
