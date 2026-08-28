import assert from "node:assert/strict";
import { createSecretKey } from "node:crypto";
import test from "node:test";
import Fastify from "fastify";
import * as jose from "jose";
import { computeZkBind, derivePhaseASessionKey } from "@elfcom/crypto";
import { primitiveRoutes } from "../routes/primitive.js";
import { messagingService } from "./messaging.js";
import { routerService } from "./router.service.js";

async function mint(owner: string) {
  const secret = process.env.LIFEOS_JWT_SECRET ?? "elfcom-dev-node-secret-change-me";
  const sid = `test:${owner}`;
  const sessionKey = derivePhaseASessionKey(secret, owner, sid);
  const zk_bind = computeZkBind(sessionKey, { aud: "elfcom", sid, ownerTrustId: owner });
  messagingService.bindSession({
    sid,
    ownerTrustId: owner,
    zk_bind,
    sessionKeyBase64: sessionKey.toString("base64"),
  });
  return new jose.SignJWT({
    sid,
    zk_bind,
    scp: ["thread:read", "thread:write", "message:send", "session:bind", "events:subscribe"],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("lifeos")
    .setAudience("elfcom")
    .setSubject(owner)
    .setExpirationTime("5m")
    .sign(createSecretKey(Buffer.from(secret, "utf8")));
}

test("POST /v1/messages/send routes via RouterService", async () => {
  const owner = "TD-PRIM-1";
  routerService.setRegistry(null);
  routerService.setSenders({
    whatsapp: async () => ({ providerMessageId: "wa-ok" }),
  });

  const app = Fastify();
  await primitiveRoutes(app);
  await app.ready();

  const token = await mint(owner);
  const res = await app.inject({
    method: "POST",
    url: "/v1/messages/send",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      recipientId: owner,
      body: "primitive hello",
      channel: "whatsapp",
      threadId: "thread-prim-1",
    },
  });

  assert.equal(res.statusCode, 200, res.body);
  const data = res.json() as {
    message: { body: string; threadId: string };
    route: { ok: boolean; channel?: string };
  };
  assert.equal(data.message.body, "primitive hello");
  assert.equal(data.message.threadId, "thread-prim-1");
  assert.equal(data.route.ok, true);
  assert.equal(data.route.channel, "whatsapp");

  const threads = await app.inject({
    method: "GET",
    url: `/v1/threads/${owner}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(threads.statusCode, 200);
  const tdata = threads.json() as { threads: unknown[] };
  assert.ok(tdata.threads.length >= 1);

  await app.close();
});

test("POST /v1/messages/batch dispatches concurrently", async () => {
  const owner = "TD-PRIM-2";
  routerService.setRegistry(null);
  routerService.setSenders({
    telegram: async () => ({ providerMessageId: "tg-batch" }),
    email: async () => ({ providerMessageId: "em-batch" }),
  });

  const app = Fastify();
  await primitiveRoutes(app);
  await app.ready();
  const token = await mint(owner);

  const res = await app.inject({
    method: "POST",
    url: "/v1/messages/batch",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      messages: [
        { recipientId: owner, body: "a", channel: "telegram", threadId: "tb1" },
        { recipientId: owner, body: "b", channel: "email", threadId: "tb2" },
      ],
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  const data = res.json() as { results: unknown[] };
  assert.equal(data.results.length, 2);
  await app.close();
});
