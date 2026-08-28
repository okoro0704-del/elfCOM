import * as jose from "jose";
import type { SessionMaterial } from "./types";
import { bytesToB64, zeroKey } from "./crypto";

const INFO_ZK = new TextEncoder().encode("elfcom/v1/zk-bind");

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hmacSha256(secret: string | Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const keyBytes = typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data.buffer as ArrayBuffer));
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Matches @elfcom/crypto derivePhaseASessionKey */
export async function derivePhaseASessionKey(
  nodeSecret: string,
  ownerTrustId: string,
  sid: string,
): Promise<Uint8Array> {
  const data = new TextEncoder().encode(`elfcom:session-key:${ownerTrustId}:${sid}`);
  return hmacSha256(nodeSecret, data);
}

/** Matches @elfcom/crypto computeZkBind */
export async function computeZkBind(
  sessionKey: Uint8Array,
  input: { aud: string; sid: string; ownerTrustId: string },
): Promise<string> {
  const data = concatBytes(
    INFO_ZK,
    new TextEncoder().encode(input.aud),
    new TextEncoder().encode("|"),
    new TextEncoder().encode(input.sid),
    new TextEncoder().encode("|"),
    new TextEncoder().encode(input.ownerTrustId),
  );
  return toHex(await hmacSha256(sessionKey, data));
}

export async function createSessionMaterial(input: {
  ownerTrustId: string;
  nodeSecret: string;
  aud?: string;
}): Promise<SessionMaterial> {
  const sid = `console:${input.ownerTrustId}`;
  const aud = input.aud ?? "elfcom";
  const sessionKey = await derivePhaseASessionKey(input.nodeSecret, input.ownerTrustId, sid);
  const zkBind = await computeZkBind(sessionKey, {
    aud,
    sid,
    ownerTrustId: input.ownerTrustId,
  });
  return { ownerTrustId: input.ownerTrustId, sid, sessionKey, zkBind };
}

export async function mintCapabilityJwt(input: {
  material: SessionMaterial;
  nodeSecret: string;
  iss?: string;
  aud?: string;
}): Promise<string> {
  const key = new TextEncoder().encode(input.nodeSecret);
  return new jose.SignJWT({
    sid: input.material.sid,
    zk_bind: input.material.zkBind,
    scp: [
      "thread:read",
      "thread:write",
      "message:send",
      "session:bind",
      "channel:link",
      "events:subscribe",
    ],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(input.iss ?? "lifeos")
    .setAudience(input.aud ?? "elfcom")
    .setSubject(input.material.ownerTrustId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

export function sessionKeyBase64(material: SessionMaterial): string {
  return bytesToB64(material.sessionKey);
}

export function destroySession(material: SessionMaterial | null) {
  if (material) zeroKey(material.sessionKey);
}
