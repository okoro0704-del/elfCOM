import { createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";

const INFO_USER = Buffer.from("elfcom/v1/user-wrap", "utf8");
const INFO_ZK = Buffer.from("elfcom/v1/zk-bind", "utf8");

/** Parse 32-byte master key from base64, hex, or raw 32-char utf8. */
export function parseMasterKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const b64 = Buffer.from(trimmed, "base64");
  if (b64.length === 32) return b64;
  const hex = Buffer.from(trimmed, "hex");
  if (hex.length === 32) return hex;
  const utf8 = Buffer.from(trimmed, "utf8");
  if (utf8.length === 32) return utf8;
  throw new Error("ELFCOM_NODE_MASTER_KEY must be 32 bytes (base64, hex, or utf8)");
}

/** Per-owner durable wrap key: HKDF(master, ownerTrustId). */
export function deriveUserKey(masterKey: Buffer, ownerTrustId: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", masterKey, Buffer.from(ownerTrustId, "utf8"), INFO_USER, 32),
  );
}

/** Phase-A gateway session key derivation (until real ZK material is passed). */
export function derivePhaseASessionKey(
  nodeSecret: string,
  ownerTrustId: string,
  sid: string,
): Buffer {
  return createHmac("sha256", nodeSecret)
    .update("elfcom:session-key:")
    .update(ownerTrustId)
    .update(":")
    .update(sid)
    .digest();
}

/** zk_bind = hex(HMAC(sessionKey, aud||sid||ownerTrustId)). */
export function computeZkBind(
  sessionKey: Buffer,
  input: { aud: string; sid: string; ownerTrustId: string },
): string {
  return createHmac("sha256", sessionKey)
    .update(INFO_ZK)
    .update(input.aud)
    .update("|")
    .update(input.sid)
    .update("|")
    .update(input.ownerTrustId)
    .digest("hex");
}

export function randomSessionKey(): Buffer {
  return randomBytes(32);
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

const INFO_HANDLE = Buffer.from("elfcom/v1/handle-blind", "utf8");

/** Blind index for channel handles — never store raw phone/email in lookup columns. */
export function blindIndexHandle(
  masterKey: Buffer,
  channel: string,
  normalizedHandle: string,
): string {
  return createHmac("sha256", masterKey)
    .update(INFO_HANDLE)
    .update(channel)
    .update("|")
    .update(normalizedHandle)
    .digest("hex");
}

/** Stable omnichannel thread id from owner + peer blinds. */
export function deriveOmniThreadId(
  channel: string,
  ownerBlind: string,
  peerBlind: string,
): string {
  const digest = createHash("sha256")
    .update("omni:")
    .update(channel)
    .update(":")
    .update(ownerBlind)
    .update(":")
    .update(peerBlind)
    .digest("hex")
    .slice(0, 32);
  return `omni_${channel}_${digest}`;
}
