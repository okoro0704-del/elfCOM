/**
 * HospitalityOS → ElfCom E2E:
 * mirrors HttpElfComProvider (POST /v1/messages/send)
 * → RouterService (mocked live WhatsApp adapter)
 * → WebSocket hub message.created / message.delivered
 *
 * Uses Fastify inject (no listen) to avoid Windows UV handle races on force-exit.
 */
import assert from "node:assert/strict";
import { createSecretKey } from "node:crypto";
import test from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import * as jose from "jose";
import { computeZkBind, derivePhaseASessionKey } from "@elfcom/crypto";
import { primitiveRoutes } from "../../src/routes/primitive.js";
import { messagingService } from "../../src/services/messaging.js";
import { routerService } from "../../src/services/router.service.js";
import { webSocketService } from "../../src/services/websocket.service.js";

const SECRET = process.env.LIFEOS_JWT_SECRET ?? "elfcom-dev-node-secret-change-me";

async function mintCapability(owner: string) {
  const sid = `lifeos:${owner}`;
  const sessionKey = derivePhaseASessionKey(SECRET, owner, sid);
  const zk_bind = computeZkBind(sessionKey, { aud: "elfcom", sid, ownerTrustId: owner });
  messagingService.bindSession({
    sid,
    ownerTrustId: owner,
    zk_bind,
    sessionKeyBase64: sessionKey.toString("base64"),
  });
  const token = await new jose.SignJWT({
    sid,
    zk_bind,
    scp: [
      "thread:read",
      "thread:write",
      "message:send",
      "session:bind",
      "events:subscribe",
    ],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("lifeos")
    .setAudience("elfcom")
    .setSubject(owner)
    .setExpirationTime("5m")
    .sign(createSecretKey(Buffer.from(SECRET, "utf8")));
  return token;
}

/** HospitalityOS / HttpElfComProvider-equivalent primitive send. */
async function hospitalitySend(
  app: FastifyInstance,
  owner: string,
  input: { threadId: string; body: string; channel?: string; peerHandle?: string },
) {
  const token = await mintCapability(owner);
  const res = await app.inject({
    method: "POST",
    url: "/v1/messages/send",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      recipientId: owner,
      threadId: input.threadId,
      body: input.body,
      channel: input.channel,
      peerHandle: input.peerHandle,
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  return JSON.parse(res.body) as {
    message: { body: string; threadId: string };
    route: { ok: boolean; channel?: string };
  };
}

test("HospitalityOS HttpElfComProvider path → router → WS events", async () => {
  const owner = "TD-HOSP-E2E";
  const routeCalls: string[] = [];
  const events: Array<{ typ: string }> = [];

  routerService.setRegistry(null);
  routerService.setSenders({
    whatsapp: async (packet) => {
      routeCalls.push(packet.channel);
      return { providerMessageId: "wa-e2e-1" };
    },
  });
  webSocketService.__clear();
  webSocketService.__addTestClient({
    socket: {
      readyState: 1,
      send: (data: string) => {
        events.push(JSON.parse(data) as { typ: string });
      },
      on: () => undefined,
    } as unknown as import("ws").WebSocket,
    userId: owner,
  });

  const app = Fastify();
  await primitiveRoutes(app);
  await app.ready();

  const dm = await hospitalitySend(app, owner, {
    threadId: "hosp-thread-1",
    body: "Room ready for guest",
  });
  assert.equal(dm.message.body, "Room ready for guest");
  assert.equal(dm.message.threadId, "hosp-thread-1");

  const wa = await hospitalitySend(app, owner, {
    threadId: "hosp-wa-1",
    body: "WhatsApp guest ping",
    channel: "whatsapp",
    peerHandle: "15550001111",
  });
  assert.equal(wa.route.ok, true);
  assert.equal(wa.route.channel, "whatsapp");
  assert.ok(routeCalls.includes("whatsapp"));

  const types = events.map((e) => e.typ);
  assert.ok(types.includes("message.created"), `events=${JSON.stringify(types)}`);
  assert.ok(types.includes("message.delivered"), `events=${JSON.stringify(types)}`);

  await app.close();
  webSocketService.__clear();
});
