/**
 * P2P peer key registry + Ed25519 signature helpers for SessionBinder.
 * Keys are held in RAM only (same lifetime model as session bind).
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

export type PeerKeyRecord = {
  ownerTrustId: string;
  /** SPKI PEM public key */
  publicKeyPem: string;
  registeredAt: number;
};

export type P2pEnvelope = {
  fromTrustId: string;
  toTrustId: string;
  threadId: string;
  /** Base64 ciphertext or plaintext body bytes already sealed elsewhere */
  payloadBase64: string;
  /** Base64 Ed25519 (or node default) signature over canonical bytes */
  signatureBase64: string;
  createdAt: string;
};

function canonicalBytes(env: Omit<P2pEnvelope, "signatureBase64">): Buffer {
  return Buffer.from(
    JSON.stringify({
      fromTrustId: env.fromTrustId,
      toTrustId: env.toTrustId,
      threadId: env.threadId,
      payloadBase64: env.payloadBase64,
      createdAt: env.createdAt,
    }),
    "utf8",
  );
}

export class P2pKeyExchange {
  private readonly peers = new Map<string, PeerKeyRecord>();

  registerPublicKey(ownerTrustId: string, publicKeyPem: string) {
    this.peers.set(ownerTrustId, {
      ownerTrustId,
      publicKeyPem,
      registeredAt: Date.now(),
    });
  }

  getPublicKey(ownerTrustId: string): string | null {
    return this.peers.get(ownerTrustId)?.publicKeyPem ?? null;
  }

  /** Generate an ephemeral Ed25519 keypair for tests / local devices. */
  static generateKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    return {
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    };
  }

  signEnvelope(
    privateKeyPem: string,
    env: Omit<P2pEnvelope, "signatureBase64">,
  ): P2pEnvelope {
    const key = createPrivateKey(privateKeyPem);
    const signature = sign(null, canonicalBytes(env), key);
    return { ...env, signatureBase64: signature.toString("base64") };
  }

  /**
   * Verify P2P envelope signature using the sender's registered public key.
   */
  verifyEnvelope(envelope: P2pEnvelope): boolean {
    const pem = this.getPublicKey(envelope.fromTrustId);
    if (!pem) return false;
    try {
      const key = createPublicKey(pem);
      const { signatureBase64, ...rest } = envelope;
      return verify(null, canonicalBytes(rest), key, Buffer.from(signatureBase64, "base64"));
    } catch {
      return false;
    }
  }

  clear() {
    this.peers.clear();
  }
}
