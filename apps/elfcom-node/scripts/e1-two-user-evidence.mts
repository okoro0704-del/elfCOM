/**
 * E1 evidence script — two users exchange DMs via consumer API + WS, then restart SoT check.
 * Uses capability JWTs (server-side test harness). Browser TrustID OAuth is separate.
 */
import assert from "node:assert/strict";
import { createSecretKey } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import * as jose from "jose";
import WebSocket from "ws";
import { computeZkBind, derivePhaseASessionKey } from "@elfcom/crypto";

const BASE = process.env.ELFCOM_E1_BASE ?? "http://127.0.0.1:8791";
const SECRET = process.env.LIFEOS_JWT_SECRET ?? "elfcom-dev-node-secret-change-me";
const A = "TD-E1-LIVE-A";
const B = "TD-E1-LIVE-B";

async function mint(owner: string) {
  const sid = `e1live:${owner}`;
  const sessionKey = derivePhaseASessionKey(SECRET, owner, sid);
  const zk_bind = computeZkBind(sessionKey, { aud: "elfcom", sid, ownerTrustId: owner });
  // TrustID path auto-binds; capability path needs explicit bind.
  const token = await new jose.SignJWT({
    sid,
    zk_bind,
    scp: ["thread:read", "thread:write", "message:send", "session:bind", "events:subscribe"],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("lifeos")
    .setAudience("elfcom")
    .setSubject(owner)
    .setExpirationTime("10m")
    .sign(createSecretKey(Buffer.from(SECRET, "utf8")));

  await fetch(`${BASE}/v1/session/bind`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      sid,
      ownerTrustId: owner,
      zk_bind,
      sessionKeyBase64: sessionKey.toString("base64"),
    }),
  });
  return token;
}

function wsEvents(token: string): Promise<{ events: unknown[]; close: () => void }> {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/v1/events";
    u.search = `access_token=${encodeURIComponent(token)}`;
    const events: unknown[] = [];
    const ws = new WebSocket(u.toString());
    const timer = setTimeout(() => reject(new Error("ws timeout")), 8000);
    ws.on("open", () => {
      clearTimeout(timer);
      resolve({
        events,
        close: () => ws.close(),
      });
    });
    ws.on("message", (data) => {
      try {
        events.push(JSON.parse(String(data)));
      } catch {
        /* ignore */
      }
    });
    ws.on("error", reject);
  });
}

async function main() {
  const health = await fetch(`${BASE}/health`);
  assert.equal(health.status, 200, "node must be up");

  const tokenA = await mint(A);
  const tokenB = await mint(B);
  const subB = await wsEvents(tokenB);

  const open = await fetch(`${BASE}/v1/dm/open`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
    body: JSON.stringify({ peerTrustId: B }),
  });
  const openText = await open.text();
  assert.equal(open.status, 200, openText);
  const { thread } = JSON.parse(openText) as { thread: { id: string } };

  const send = await fetch(`${BASE}/v1/threads/${encodeURIComponent(thread.id)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
    body: JSON.stringify({ body: "hello B", peerRef: B, channel: "dm" }),
  });
  const sendText = await send.text();
  assert.equal(send.status, 200, sendText);
  await sleep(300);

  const created = subB.events.filter((e) => (e as { typ?: string }).typ === "message.created");
  assert.ok(created.length >= 1, "B must receive WS without refresh");

  const peerThread = `dm:${B}:${A}`;
  const bInbox = await fetch(`${BASE}/v1/threads/${encodeURIComponent(peerThread)}/messages`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const bMsgs = (await bInbox.json()) as { messages: { body: string }[] };
  assert.equal(bMsgs.messages[0]?.body, "hello B");

  // Reply B → A
  const subA = await wsEvents(tokenA);
  const reply = await fetch(`${BASE}/v1/threads/${encodeURIComponent(peerThread)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" },
    body: JSON.stringify({ body: "hello A", peerRef: A, channel: "dm" }),
  });
  const replyText = await reply.text();
  assert.equal(reply.status, 200, replyText);
  await sleep(300);
  const aCreated = subA.events.filter((e) => (e as { typ?: string }).typ === "message.created");
  assert.ok(aCreated.length >= 1, "A must receive reply via WS");

  // Refresh persistence (same process)
  const aReload = await fetch(`${BASE}/v1/inbox?channel=dm`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const aThreads = (await aReload.json()) as { threads: unknown[] };
  assert.ok(aThreads.threads.length >= 1, "inbox survives client refresh");

  subA.close();
  subB.close();
  console.log("E1_API_TWO_USER=PASS");
  console.log("E1_REFRESH_SAME_PROCESS=PASS");
  console.log(
    "E1_NOTE=MemoryMessageStore clears on process restart — threads/messages lost unless Postgres read-back is implemented (E2).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
