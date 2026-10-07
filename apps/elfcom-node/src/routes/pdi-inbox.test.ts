import assert from "node:assert/strict";
import { createSecretKey } from "node:crypto";
import test from "node:test";
import Fastify from "fastify";
import * as jose from "jose";
import { computeZkBind, derivePhaseASessionKey } from "@elfcom/crypto";

process.env.ELFCOM_PDI_SERVICE_TOKEN = "elfcom-pdi-test-token";

test("PDI inbox lists only the requested owner and does not open sealed content", async () => {
  const { pdiRoutes } = await import("./pdi.js");
  const { messagingService } = await import("../services/messaging.js");
  const { MemoryMessageStore } = await import("../store/memory-store.js");
  messagingService.attachStore(new MemoryMessageStore());
  const owner = "elfcom:own_inbox_a";
  const other = "elfcom:own_inbox_b";
  const secret = process.env.LIFEOS_JWT_SECRET ?? "elfcom-dev-node-secret-change-me";
  async function session(subject: string) {
    const sid = `test:${subject}`;
    const sessionKey = derivePhaseASessionKey(secret, subject, sid);
    const zk_bind = computeZkBind(sessionKey, { aud: "elfcom", sid, ownerTrustId: subject });
    messagingService.bindSession({ sid, ownerTrustId: subject, zk_bind, sessionKeyBase64: sessionKey.toString("base64") });
    const token = await new jose.SignJWT({ sid, zk_bind, scp: ["thread:write", "thread:read", "message:send", "session:bind"] })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("lifeos")
      .setAudience("elfcom")
      .setSubject(subject)
      .setExpirationTime("5m")
      .sign(createSecretKey(Buffer.from(secret, "utf8")));
    return { token, auth: { sub: subject, sid, zk_bind, scp: ["thread:write"] } };
  }
  const first = await session(owner);
  const second = await session(other);
  await messagingService.openDm(first.auth, other);
  await messagingService.openDm(second.auth, owner);
  const app = Fastify();
  await pdiRoutes(app);
  const denied = await app.inject({ method: "GET", url: `/v1/pdi/inbox?ownerRef=${encodeURIComponent(owner)}` });
  assert.equal(denied.statusCode, 401);
  const malformed = await app.inject({ method: "GET", url: "/v1/pdi/inbox?ownerRef=trust:other", headers: { authorization: "Bearer elfcom-pdi-test-token" } });
  assert.equal(malformed.statusCode, 400);
  const listed = await app.inject({ method: "GET", url: `/v1/pdi/inbox?ownerRef=${encodeURIComponent(owner)}`, headers: { authorization: "Bearer elfcom-pdi-test-token" } });
  assert.equal(listed.statusCode, 200);
  const body = listed.json() as { ownerRef: string; threads: Array<{ id: string; channel: string }> };
  assert.equal(body.ownerRef, owner);
  assert.equal(body.threads.length, 1);
  assert.equal(JSON.stringify(body).includes("titleCipher"), false);
  assert.equal(JSON.stringify(body).includes(secret), false);
  const isolated = await app.inject({ method: "GET", url: `/v1/pdi/inbox?ownerRef=${encodeURIComponent(other)}`, headers: { authorization: "Bearer elfcom-pdi-test-token" } });
  const otherBody = isolated.json() as { threads: Array<{ id: string }> };
  assert.notEqual(otherBody.threads[0]?.id, body.threads[0]?.id);
  await app.close();
});
