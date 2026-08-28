/**
 * Browser AES-256-GCM compatible with @elfcom/crypto seal format.
 * Session keys stay in RAM (module closure / React state) — never localStorage.
 */

import type { SealAad, SealedBlob } from "./types";

const NONCE_LEN = 12;
const TAG_LEN = 16;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes.slice();
}

export function encodeAad(aad: SealAad): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      ownerTrustId: aad.ownerTrustId,
      threadId: aad.threadId,
      messageId: aad.messageId,
      channel: aad.channel,
      createdAt: aad.createdAt,
    }),
  );
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", asBufferSource(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashAad(aad: SealAad): Promise<string> {
  return sha256Hex(encodeAad(aad));
}

async function importAesKey(key: Uint8Array): Promise<CryptoKey> {
  if (key.length !== 32) throw new Error("AES key must be 32 bytes");
  return crypto.subtle.importKey("raw", asBufferSource(key), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Open a session-rewrapped envelope in RAM. */
export async function openUtf8(blob: SealedBlob, key: Uint8Array, aad: SealAad): Promise<string> {
  const expected = await hashAad(aad);
  if (expected !== blob.aadHash) throw new Error("AAD mismatch");

  const nonce = b64ToBytes(blob.nonce);
  const packed = b64ToBytes(blob.ciphertext);
  if (packed.length < TAG_LEN) throw new Error("ciphertext too short");

  const data = packed.subarray(0, packed.length - TAG_LEN);
  const tag = packed.subarray(packed.length - TAG_LEN);
  const combined = new Uint8Array(data.length + tag.length);
  combined.set(data, 0);
  combined.set(tag, data.length);

  const cryptoKey = await importAesKey(key);
  const plainBuf = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: asBufferSource(nonce),
      additionalData: asBufferSource(encodeAad(aad)),
      tagLength: 128,
    },
    cryptoKey,
    asBufferSource(combined),
  );
  return new TextDecoder().decode(plainBuf);
}

export async function sealUtf8(
  plaintext: string,
  key: Uint8Array,
  aad: SealAad,
  kid: string,
): Promise<SealedBlob> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
  const cryptoKey = await importAesKey(key);
  const pt = new TextEncoder().encode(plaintext);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: asBufferSource(nonce),
        additionalData: asBufferSource(encodeAad(aad)),
        tagLength: 128,
      },
      cryptoKey,
      asBufferSource(pt),
    ),
  );
  return {
    ciphertext: bytesToB64(sealed),
    nonce: bytesToB64(nonce),
    kid,
    aadHash: await hashAad(aad),
  };
}

/** Zero a key buffer when session ends. */
export function zeroKey(key: Uint8Array) {
  key.fill(0);
}

export { bytesToB64, b64ToBytes };
