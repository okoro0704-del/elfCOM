/**
 * E2 — Postgres source-of-truth tests.
 * Skips when DATABASE_URL is unset (CI without DB).
 * Requires a reachable Postgres (not railway.internal from local machines).
 */
import assert from "node:assert/strict";
import { createSecretKey } from "node:crypto";
import test from "node:test";
import Fastify from "fastify";
import * as jose from "jose";
import { computeZkBind, derivePhaseASessionKey } from "@elfcom/crypto";
import { PrismaClient } from "@prisma/client";
import { v1Routes } from "../routes/v1.js";
import { messagingService, nativeDmThreadId } from "./messaging.js";
import { PostgresMessageStore } from "../store/postgres-store.js";
import { webSocketService } from "./websocket.service.js";

const hasDb = Boolean(process.env.DATABASE_URL);
const SECRET = process.env.LIFEOS_JWT_SECRET ?? "elfcom-dev-node-secret-change-me";

async function mint(owner: string) {
  const sid = `e2:${owner}:${Date.now()}`;
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
    .setExpirationTime("10m")
    .sign(createSecretKey(Buffer.from(SECRET, "utf8")));
}

test("E2 Postgres SoT: commit, read, isolation, concurrent DM, concurrent send", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set");
    return;
  }

  const prisma = new PrismaClient();
  // Wait briefly for flaky Railway TCP proxy
  let ready = false;
  for (let i = 0; i < 10; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!ready) {
    t.skip("Postgres unreachable via DATABASE_URL");
    await prisma.$disconnect();
    return;
  }

  const store = new PostgresMessageStore(prisma);
  messagingService.attachStore(store);
  webSocketService.__clear();

  const suffix = `${Date.now()}`;
  const A = `TD-E2-A-${suffix}`;
  const B = `TD-E2-B-${suffix}`;
  const C = `TD-E2-C-${suffix}`;

  const tokenA = await mint(A);
  const tokenB = await mint(B);
  const tokenC = await mint(C);

  const app = Fastify();
  await v1Routes(app);
  await app.ready();

  // Concurrent DM open → one thread
  const opens = await Promise.all(
    Array.from({ length: 20 }, () =>
      app.inject({
        method: "POST",
        url: "/v1/dm/open",
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { peerTrustId: B },
      }),
    ),
  );
  for (const r of opens) assert.equal(r.statusCode, 200, r.body);
  const threadIds = new Set(
    opens.map((r) => (r.json() as { thread: { id: string } }).thread.id),
  );
  assert.equal(threadIds.size, 1);
  const threadId = [...threadIds][0]!;
  assert.equal(threadId, nativeDmThreadId(A, B));

  const count = await prisma.thread.count({
    where: { ownerTrustId: A, channel: "dm", peerRef: B },
  });
  assert.equal(count, 1);

  // Concurrent sends — modest parallelism (proxy latency)
  const sends = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      app.inject({
        method: "POST",
        url: `/v1/threads/${encodeURIComponent(threadId)}/messages`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { body: `msg-${i}`, peerRef: B, channel: "dm" },
      }),
    ),
  );
  for (const r of sends) assert.equal(r.statusCode, 200, r.body);
  const aMsgs = await app.inject({
    method: "GET",
    url: `/v1/threads/${encodeURIComponent(threadId)}/messages`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  const list = (aMsgs.json() as { messages: { id: string; body: string }[] }).messages;
  assert.equal(list.length, 20);
  const ids = new Set(list.map((m) => m.id));
  assert.equal(ids.size, 20);

  // Ordering
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1]!;
    const cur = list[i]!;
    const cmp = prev.createdAt.localeCompare(cur.createdAt) || prev.id.localeCompare(cur.id);
    assert.ok(cmp <= 0);
  }

  // Foreign owner isolation
  const steal = await app.inject({
    method: "GET",
    url: `/v1/threads/${encodeURIComponent(threadId)}/messages`,
    headers: { authorization: `Bearer ${tokenC}` },
  });
  assert.equal((steal.json() as { messages: unknown[] }).messages.length, 0);

  // Peer inbox durable (fan-out)
  const peerThread = nativeDmThreadId(B, A);
  const bMsgs = await app.inject({
    method: "GET",
    url: `/v1/threads/${encodeURIComponent(peerThread)}/messages`,
    headers: { authorization: `Bearer ${tokenB}` },
  });
  assert.equal((bMsgs.json() as { messages: unknown[] }).messages.length, 20);

  // New store instance (simulate process memory wipe) still reads same data
  const store2 = new PostgresMessageStore(prisma);
  messagingService.attachStore(store2);
  const tokenA2 = await mint(A);
  const after = await app.inject({
    method: "GET",
    url: `/v1/threads/${encodeURIComponent(threadId)}/messages`,
    headers: { authorization: `Bearer ${tokenA2}` },
  });
  assert.equal((after.json() as { messages: unknown[] }).messages.length, 20);

  // Digi-authority delegated send commits to Postgres for owner + peer mirror
  const delegated = await messagingService.sendDelegatedAuthorityMessage({
    ownerTrustId: A,
    digiOwnerId: `digi-${suffix}`,
    actor: "digi-test",
    threadId,
    body: "delegated durable",
    peerRef: B,
    grantId: "grant-test",
    jti: `jti-${suffix}`,
    correlationId: `corr-${suffix}`,
    actionId: "message.send",
  });
  const ownerRow = await prisma.message.findUnique({
    where: { id_ownerTrustId: { id: delegated.id, ownerTrustId: A } },
  });
  assert.ok(ownerRow, "delegated message must be committed for owner");
  const peerRow = await prisma.message.findUnique({
    where: { id_ownerTrustId: { id: delegated.id, ownerTrustId: B } },
  });
  assert.ok(peerRow, "delegated message must be mirrored to peer");
  assert.ok(!ownerRow.bodyCipherJson.includes("delegated durable"), "body stays sealed");

  // Cleanup test rows
  await prisma.message.deleteMany({ where: { ownerTrustId: { in: [A, B] } } });
  await prisma.thread.deleteMany({ where: { ownerTrustId: { in: [A, B] } } });

  await app.close();
  await prisma.$disconnect();
});
