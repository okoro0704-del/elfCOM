import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { SealedBlob } from "@elfcom/contract";

const ALGO = "aes-256-gcm";
const NONCE_LEN = 12;
const TAG_LEN = 16;

export type SealAad = {
  ownerTrustId: string;
  threadId: string;
  messageId: string;
  channel: string;
  createdAt: string;
};

export function encodeAad(aad: SealAad): Buffer {
  return Buffer.from(
    JSON.stringify({
      ownerTrustId: aad.ownerTrustId,
      threadId: aad.threadId,
      messageId: aad.messageId,
      channel: aad.channel,
      createdAt: aad.createdAt,
    }),
    "utf8",
  );
}

export function hashAad(aad: SealAad): string {
  return createHash("sha256").update(encodeAad(aad)).digest("hex");
}

/** AES-256-GCM seal. `key` must be 32 bytes. */
export function seal(plaintext: string | Buffer, key: Buffer, aad: SealAad, kid: string): SealedBlob {
  if (key.length !== 32) {
    throw new Error("seal: key must be 32 bytes");
  }
  const nonce = randomBytes(NONCE_LEN);
  const aadBuf = encodeAad(aad);
  const cipher = createCipheriv(ALGO, key, nonce);
  cipher.setAAD(aadBuf);
  const pt = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
  const encrypted = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, tag]).toString("base64"),
    nonce: nonce.toString("base64"),
    kid,
    aadHash: hashAad(aad),
  };
}

/** AES-256-GCM open. Verifies AAD hash before decrypt. */
export function open(blob: SealedBlob, key: Buffer, aad: SealAad): Buffer {
  if (key.length !== 32) {
    throw new Error("open: key must be 32 bytes");
  }
  if (hashAad(aad) !== blob.aadHash) {
    throw new Error("open: AAD mismatch");
  }
  const nonce = Buffer.from(blob.nonce, "base64");
  const packed = Buffer.from(blob.ciphertext, "base64");
  if (packed.length < TAG_LEN) {
    throw new Error("open: ciphertext too short");
  }
  const data = packed.subarray(0, packed.length - TAG_LEN);
  const tag = packed.subarray(packed.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAAD(encodeAad(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function openUtf8(blob: SealedBlob, key: Buffer, aad: SealAad): string {
  return open(blob, key, aad).toString("utf8");
}
