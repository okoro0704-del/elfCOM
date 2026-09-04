/**
 * Service-to-service BaaS API keys for cross-primitive notify.
 *
 * Env ELFCOM_BAAS_API_KEYS:
 *   appId:secret,appId2:secret2
 * Header:
 *   X-ElfCom-Api-Key: <secret>
 *   or Authorization: Bearer elfcom_baas_<secret>
 */
import { timingSafeEqual, createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

export type BaasPrincipal = {
  appId: string;
  tenantId?: string;
};

declare module "fastify" {
  interface FastifyRequest {
    baasAuth?: BaasPrincipal;
  }
}

function parseKeyMap(): Map<string, { appId: string; tenantId?: string }> {
  const map = new Map<string, { appId: string; tenantId?: string }>();
  for (const part of config.baasApiKeys) {
    // Formats:
    //   appId:secret
    //   tenantId/appId:secret
    const idx = part.lastIndexOf(":");
    if (idx <= 0) continue;
    const left = part.slice(0, idx).trim();
    const secret = part.slice(idx + 1).trim();
    if (!left || !secret) continue;
    const slash = left.indexOf("/");
    if (slash > 0) {
      map.set(secret, {
        tenantId: left.slice(0, slash),
        appId: left.slice(slash + 1),
      });
    } else {
      map.set(secret, { appId: left });
    }
  }
  return map;
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
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
  const map = parseKeyMap();
  for (const [known, principal] of map) {
    if (safeEqual(known, secret)) return principal;
  }
  return null;
}

/**
 * Prefer BaaS API key. On success sets req.baasAuth.
 * Returns true if authenticated via API key.
 */
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
