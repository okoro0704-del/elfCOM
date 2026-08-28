import { createSecretKey } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import * as jose from "jose";
import { config } from "../config.js";

export type VerifiedCapability = {
  sub: string;
  sid: string;
  zk_bind: string;
  scp: string[];
};

declare module "fastify" {
  interface FastifyRequest {
    elfcomAuth?: VerifiedCapability;
  }
}

function secretKey() {
  return createSecretKey(Buffer.from(config.jwtSecret, "utf8"));
}

export async function verifyCapabilityJwt(token: string): Promise<VerifiedCapability> {
  const { payload } = await jose.jwtVerify(token, secretKey(), {
    issuer: config.jwtIss,
    audience: config.jwtAud,
  });

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const sid = typeof payload.sid === "string" ? payload.sid : "";
  const zk_bind = typeof payload.zk_bind === "string" ? payload.zk_bind : "";
  const scp = Array.isArray(payload.scp)
    ? payload.scp.filter((s): s is string => typeof s === "string")
    : typeof payload.scp === "string"
      ? payload.scp.split(" ").filter(Boolean)
      : [];

  if (!sub) throw new Error("missing sub");
  if (!sid) throw new Error("missing sid");
  if (!zk_bind) throw new Error("missing zk_bind");
  if (payload.aud !== config.jwtAud && !(Array.isArray(payload.aud) && payload.aud.includes(config.jwtAud))) {
    throw new Error("invalid aud");
  }

  return { sub, sid, zk_bind, scp };
}

export async function requireCapability(
  req: FastifyRequest,
  reply: FastifyReply,
  needed: string[] = [],
) {
  const header = req.headers.authorization;
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return reply.code(401).send({ error: "unauthorized", message: "Missing Bearer token" });
  }
  const token = header.slice(7).trim();
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
  } catch (err) {
    return reply.code(401).send({
      error: "invalid_token",
      message: err instanceof Error ? err.message : "JWT verification failed",
    });
  }
}

/** Mint helper for local tests / tooling. */
export async function mintCapabilityJwt(input: {
  sub: string;
  sid: string;
  zk_bind: string;
  scp?: string[];
  expiresInSeconds?: number;
}): Promise<string> {
  return new jose.SignJWT({
    sid: input.sid,
    zk_bind: input.zk_bind,
    scp: input.scp ?? [
      "thread:read",
      "thread:write",
      "message:send",
      "session:bind",
    ],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(config.jwtIss)
    .setAudience(config.jwtAud)
    .setSubject(input.sub)
    .setIssuedAt()
    .setExpirationTime(`${input.expiresInSeconds ?? 300}s`)
    .sign(secretKey());
}
