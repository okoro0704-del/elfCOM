/**
 * E1 — native TrustID↔TrustID DM fan-out + auth + WebSocket isolation.
 */
import assert from "node:assert/strict";
import { createSecretKey } from "node:crypto";
import test from "node:test";
import Fastify from "fastify";
import * as jose from "jose";
import { computeZkBind, derivePhaseASessionKey } from "@elfcom/crypto";
import { v1Routes } from "../routes/v1.js";
import { websocketRoutes } from "../routes/primitive.js";
import { messagingService } from "../services/messaging.js";
import { webSocketService } from "../services/websocket.service.js";
import { nativeDmThreadId } from "../services/messaging.js";

const SECRET = process.env.LIFEOS_JWT_SECRET ?? "elfcom-dev-node-secret-change-me";

async function mint(owner: string, scp?: string[]) {
  const sid = `e1:${owner}`;
  const sessionKey = derivePhaseASessionKey(SECRET, owner, sid);
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
    scp: scp ?? [
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
}

test("invalid token rejected on inbox", async () => {
  const app = Fastify();
  await v1Routes(app);
  await app.ready();
  const res = await app.inject({
    method: "GET",
    url: "/v1/inbox",
    headers: { authorization: "Bearer not-a-jwt" },
  });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test("foreign thread messages return empty / own thread accessible", async () => {
  messagingService.store.clear();
  const a = "TD-E1-A";
  const b = "TD-E1-B";
  const tokenA = await mint(a);
  const tokenB = await mint(b);

  const app = Fastify();
  await v1Routes(app);
  await app.ready();

  const open = await app.inject({
    method: "POST",
    url: "/v1/dm/open",
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { peerTrustId: b },
  });
  assert.equal(open.statusCode, 200, open.body);
  const threadId = (open.json() as { thread: { id: string } }).thread.id;
  assert.equal(threadId, nativeDmThreadId(a, b));

  const send = await app.inject({
    method: "POST",
    url: `/v1/threads/${encodeURIComponent(threadId)}/messages`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { body: "hello B", peerRef: b, channel: "dm" },
  });
  assert.equal(send.statusCode, 200, send.body);

  const aMsgs = await app.inject({
    method: "GET",
    url: `/v1/threads/${encodeURIComponent(threadId)}/messages`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(aMsgs.statusCode, 200);
  assert.equal((aMsgs.json() as { messages: unknown[] }).messages.length, 1);

  // B cannot read A's owner-scoped thread id
  const bSteal = await app.inject({
    method: "GET",
    url: `/v1/threads/${encodeURIComponent(threadId)}/messages`,
    headers: { authorization: `Bearer ${tokenB}` },
  });
  assert.equal(bSteal.statusCode, 200);
  assert.equal((bSteal.json() as { messages: unknown[] }).messages.length, 0);

  // B has own mirrored thread
  const peerThread = nativeDmThreadId(b, a);
  const bMsgs = await app.inject({
    method: "GET",
    url: `/v1/threads/${encodeURIComponent(peerThread)}/messages`,
    headers: { authorization: `Bearer ${tokenB}` },
  });
  assert.equal(bMsgs.statusCode, 200);
  const list = (bMsgs.json() as { messages: { body: string; senderId: string }[] }).messages;
  assert.equal(list.length, 1);
  assert.equal(list[0]!.body, "hello B");
  assert.equal(list[0]!.senderId, a);

  await app.close();
});

test("DM send fans out WS to peer only; unrelated user silent", async () => {
  messagingService.store.clear();
  webSocketService.__clear();
  const a = "TD-E1-WS-A";
  const b = "TD-E1-WS-B";
  const c = "TD-E1-WS-C";
  const tokenA = await mint(a);

  const receivedB: unknown[] = [];
  const receivedC: unknown[] = [];
  webSocketService.__addTestClient({
    userId: b,
    socket: {
      readyState: 1,
      send: (payload: string) => receivedB.push(JSON.parse(payload)),
      on: () => {},
    } as unknown as import("ws").WebSocket,
  });
  webSocketService.__addTestClient({
    userId: c,
    socket: {
      readyState: 1,
      send: (payload: string) => receivedC.push(JSON.parse(payload)),
      on: () => {},
    } as unknown as import("ws").WebSocket,
  });

  const app = Fastify();
  await v1Routes(app);
  await websocketRoutes(app);
  await app.ready();

  const open = await app.inject({
    method: "POST",
    url: "/v1/dm/open",
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { peerTrustId: b },
  });
  const threadId = (open.json() as { thread: { id: string } }).thread.id;

  const send = await app.inject({
    method: "POST",
    url: `/v1/threads/${encodeURIComponent(threadId)}/messages`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { body: "ping", peerRef: b, channel: "dm" },
  });
  assert.equal(send.statusCode, 200, send.body);

  const bCreated = receivedB.filter(
    (e) => (e as { typ?: string }).typ === "message.created",
  );
  assert.ok(bCreated.length >= 1, "peer B should receive message.created");
  assert.equal(receivedC.length, 0, "unrelated C must not receive events");

  await app.close();
  webSocketService.__clear();
});

test("empty send body rejected", async () => {
  messagingService.store.clear();
  const a = "TD-E1-EMPTY";
  const token = await mint(a);
  const app = Fastify();
  await v1Routes(app);
  await app.ready();
  const res = await app.inject({
    method: "POST",
    url: "/v1/threads/dm%3Ax%3Ay/messages",
    headers: { authorization: `Bearer ${token}` },
    payload: { body: "" },
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});
