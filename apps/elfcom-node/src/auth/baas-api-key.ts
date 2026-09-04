/**
 * Service-to-service BaaS API keys for cross-primitive notify.
 *
 * Env ELFCOM_BAAS_API_KEYS (comma-separated):
 *   appId:plaintextSecret
 *   appId:sha256=<hex>          ← preferred (store hash only)
 *   tenantId/appId:sha256=<hex>
 *
 * Header:
 *   X-ElfCom-Api-Key: <plaintext secret>
 *   or Authorization: Bearer elfcom_baas_<plaintext secret>
 */
import { timingSafeEqual, createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

export type BaasPrincipal = {
  appId: string;
  tenantId?: string;
};

type KeyEntry = BaasPrincipal & {
  /** sha256 hex of the plaintext secret */
  secretHash: string;
};

declare module "fastify" {
  interface FastifyRequest {
    baasAuth?: BaasPrincipal;
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseKeyEntries(): KeyEntry[] {
  const entries: KeyEntry[] = [];
  for (const part of config.baasApiKeys) {
    const idx = part.lastIndexOf(":");
    if (idx <= 0) continue;
    const left = part.slice(0, idx).trim();
    const right = part.slice(idx + 1).trim();
    if (!left || !right) continue;

    let tenantId: string | undefined;
    let appId = left;
    const slash = left.indexOf("/");
    if (slash > 0) {
      tenantId = left.slice(0, slash);
      appId = left.slice(slash + 1);
    }

    const secretHash = right.toLowerCase().startsWith("sha256=")
      ? right.slice("sha256=".length).trim().toLowerCase()
      : sha256Hex(right);

    if (!/^[a-f0-9]{64}$/.test(secretHash)) continue;
    entries.push({ appId, tenantId, secretHash });
  }
  return entries;
}

function hashesEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function extractBaasApiKey(req: FastifyRequest): string | null {
  const headerKey = req.headers["x-elfcom-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) return headerKey.trim();

  const auth = req.headers.authorization;
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token.startsWith("elfcom_baas_")) return token.slice("elfcom_baas_".length);
  }
  return null;
}

/** Verify API key; returns principal or null. */
export function verifyBaasApiKey(secret: string): BaasPrincipal | null {
  const presented = sha256Hex(secret);
  for (const entry of parseKeyEntries()) {
    if (hashesEqual(entry.secretHash, presented)) {
      return { appId: entry.appId, tenantId: entry.tenantId };
    }
  }
  return null;
}

export function tryBaasApiKeyAuth(req: FastifyRequest): boolean {
  const secret = extractBaasApiKey(req);
  if (!secret) return false;
  const principal = verifyBaasApiKey(secret);
  if (!principal) return false;
  req.baasAuth = principal;
  return true;
}

export async function requireBaasApiKey(req: FastifyRequest, reply: FastifyReply) {
  if (tryBaasApiKeyAuth(req)) return;
  const secret = extractBaasApiKey(req);
  if (!secret) {
    return reply.code(401).send({
      error: "unauthorized",
      message: "Missing X-ElfCom-Api-Key or Bearer elfcom_baas_<key>",
    });
  }
  return reply.code(401).send({ error: "invalid_api_key", message: "Unknown API key" });
}
