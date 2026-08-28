/**
 * TrustID JWKS auth — validates bearer tokens against TrustID assertion keys.
 * Falls back to LifeOS capability JWT (Phase C) when TrustID JWKS is unset or token is capability-shaped.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import * as jose from "jose";
import { config } from "../config.js";
import {
  requireCapability,
  verifyCapabilityJwt,
  type VerifiedCapability,
} from "../auth/node-jwt.js";
import { computeZkBind, derivePhaseASessionKey } from "@elfcom/crypto";
import { messagingService } from "../services/messaging.js";

export type TrustIdClaims = {
  sub: string;
  iss?: string;
  aud?: string | string[];
  sid?: string;
  scope?: string;
  scp?: string[];
};

let jwks: jose.JWTVerifyGetKey | null = null;

function getJwks(): jose.JWTVerifyGetKey | null {
  if (!config.trustIdJwksUrl) return null;
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(config.trustIdJwksUrl));
  }
  return jwks;
}

/** Reset JWKS cache (tests). */
export function __resetTrustIdJwks() {
  jwks = null;
}

export async function verifyTrustIdToken(token: string): Promise<VerifiedCapability> {
  const keySet = getJwks();
  if (!keySet) throw new Error("trustid_jwks_unconfigured");

  const { payload } = await jose.jwtVerify(token, keySet, {
    issuer: config.trustIdIssuer || undefined,
    audience: config.trustIdAudience || undefined,
  });

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) throw new Error("missing sub");

  const sid =
    typeof payload.sid === "string"
      ? payload.sid
      : typeof payload.session_id === "string"
        ? payload.session_id
        : `trustid:${sub}`;

  const scp = Array.isArray(payload.scp)
    ? payload.scp.filter((s): s is string => typeof s === "string")
    : typeof payload.scope === "string"
      ? payload.scope.split(" ").filter(Boolean)
      : [
          "thread:read",
          "thread:write",
          "message:send",
          "session:bind",
          "events:subscribe",
          "channel:link",
        ];

  // Derive Phase-A session material so primitive sends can bind consistently.
  const sessionKey = derivePhaseASessionKey(config.jwtSecret, sub, sid);
  const zk_bind = computeZkBind(sessionKey, {
    aud: config.jwtAud,
    sid,
    ownerTrustId: sub,
  });

  messagingService.bindSession({
    sid,
    ownerTrustId: sub,
    zk_bind,
    sessionKeyBase64: sessionKey.toString("base64"),
  });

  return { sub, sid, zk_bind, scp };
}

/**
 * Accept either LifeOS capability JWT or TrustID JWKS-validated access token.
 */
export async function requireTrustIdOrCapability(
  req: FastifyRequest,
  reply: FastifyReply,
  needed: string[] = [],
) {
  const header = req.headers.authorization;
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return reply.code(401).send({ error: "unauthorized", message: "Missing Bearer token" });
  }
  const token = header.slice(7).trim();

  // Prefer existing capability verification (Phase C / LifeOS adapter).
  try {
    const claims = await verifyCapabilityJwt(token);
    for (const scope of needed) {
      if (!claims.scp.includes(scope)) {
        return reply.code(403).send({
          error: "forbidden",
          message: `Missing scope: ${scope}`,
        });
      }
    }
    req.elfcomAuth = claims;
    return;
  } catch {
    /* try TrustID */
  }

  if (!config.trustIdJwksUrl) {
    return requireCapability(req, reply, needed);
  }

  try {
    const claims = await verifyTrustIdToken(token);
    for (const scope of needed) {
      if (!claims.scp.includes(scope)) {
        return reply.code(403).send({
          error: "forbidden",
          message: `Missing scope: ${scope}`,
        });
      }
    }
    req.elfcomAuth = claims;
    (req as FastifyRequest & { trustIdAuth?: boolean }).trustIdAuth = true;
  } catch (err) {
    return reply.code(401).send({
      error: "invalid_token",
      message: err instanceof Error ? err.message : "TrustID / capability verification failed",
    });
  }
}

/** WebSocket token verify — capability or TrustID. */
export async function verifyEventsToken(token: string): Promise<VerifiedCapability> {
  try {
    return await verifyCapabilityJwt(token);
  } catch {
    if (!config.trustIdJwksUrl) throw new Error("invalid_token");
    return verifyTrustIdToken(token);
  }
}
