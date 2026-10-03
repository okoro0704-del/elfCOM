/**
 * E2 live durability check against a deployed node.
 *
 *   ELFCOM_URL=https://... LIFEOS_JWT_SECRET=... npx tsx scripts/e2-live-restart.mts seed
 *   (restart the service process)
 *   ELFCOM_URL=https://... LIFEOS_JWT_SECRET=... npx tsx scripts/e2-live-restart.mts verify
 *
 * Uses throwaway TD-E2-LIVE-* identities. State is kept in the OS temp dir.
 */
import { createSecretKey } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as jose from "jose";
import { computeZkBind, derivePhaseASessionKey } from "@elfcom/crypto";

const base = (process.env.ELFCOM_URL ?? "").replace(/\/$/, "");
const secret = process.env.LIFEOS_JWT_SECRET ?? "";
const statePath = path.join(tmpdir(), "elfcom-e2-live-state.json");
if (!base || !secret) throw new Error("ELFCOM_URL and LIFEOS_JWT_SECRET are required");

type State = { A: string; B: string; C: string; body: string; threadId: string; peerThreadId: string; messageId: string };

async function session(owner: string) {
  const sid = `e2-live:${owner}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const key = derivePhaseASessionKey(secret, owner, sid);
  const zk_bind = computeZkBind(key, { aud: "elfcom", sid, ownerTrustId: owner });
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
    .sign(createSecretKey(Buffer.from(secret, "utf8")));
  const bind = await call(token, "POST", "/v1/session/bind", {
    sid,
    ownerTrustId: owner,
    zk_bind,
    sessionKeyBase64: key.toString("base64"),
  });
  if (bind.status !== 204) throw new Error(`bind ${owner} -> ${bind.status} ${bind.text}`);
  return token;
}

async function call(token: string, method: string, url: string, body?: unknown) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, text, json: () => JSON.parse(text) };
}

async function health() {
  const res = await fetch(`${base}/health`);
  const j = (await res.json()) as { commit?: string; messaging?: unknown };
  return { commit: j.commit, messaging: j.messaging };
}

async function seed() {
  const ts = Date.now();
  const A = `TD-E2-LIVE-A-${ts}`;
  const B = `TD-E2-LIVE-B-${ts}`;
  const C = `TD-E2-LIVE-C-${ts}`;
  const body = `persist me ${ts}`;
  console.log("health", JSON.stringify(await health()));

  const tA = await session(A);
  const open = await call(tA, "POST", "/v1/dm/open", { peerTrustId: B });
  if (open.status !== 200) throw new Error(`dm/open ${open.status} ${open.text}`);
  const threadId = open.json().thread.id as string;

  // B never connects a WebSocket: offline recipient.
  const send = await call(tA, "POST", `/v1/threads/${encodeURIComponent(threadId)}/messages`, {
    body,
    peerRef: B,
    channel: "dm",
  });
  if (send.status !== 200) throw new Error(`send ${send.status} ${send.text}`);
  const messageId = send.json().message.id as string;

  const tB = await session(B);
  const inboxB = await call(tB, "GET", "/v1/inbox");
  const peerThread = (inboxB.json().threads as { id: string }[]).find((t) => t.id.includes(A));
  if (!peerThread) throw new Error(`B inbox missing thread: ${inboxB.text}`);

  const state: State = { A, B, C, body, threadId, peerThreadId: peerThread.id, messageId };
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log("seeded", JSON.stringify({ A, B, threadId, peerThreadId: peerThread.id, messageId, body }));
}

async function verify() {
  const s = JSON.parse(readFileSync(statePath, "utf8")) as State;
  console.log("health", JSON.stringify(await health()));

  const tA = await session(s.A);
  const inbox = await call(tA, "GET", "/v1/inbox");
  const hasThread = (inbox.json().threads as { id: string }[]).some((t) => t.id === s.threadId);
  const msgs = await call(tA, "GET", `/v1/threads/${encodeURIComponent(s.threadId)}/messages`);
  const list = msgs.json().messages as { id: string; body: string }[];
  const mine = list.find((m) => m.id === s.messageId);

  const tB = await session(s.B);
  const bMsgs = await call(tB, "GET", `/v1/threads/${encodeURIComponent(s.peerThreadId)}/messages`);
  const peer = (bMsgs.json().messages as { id: string; body: string }[]).find((m) => m.id === s.messageId);

  const tC = await session(s.C);
  const steal = await call(tC, "GET", `/v1/threads/${encodeURIComponent(s.threadId)}/messages`);
  const stolen = (steal.json().messages as unknown[]).length;

  const noAuth = await fetch(`${base}/v1/inbox`);
  const badToken = await call("not-a-jwt", "GET", "/v1/inbox");

  const result = {
    inboxHasThread: hasThread,
    ownerMessage: mine ? { id: mine.id, body: mine.body } : null,
    peerMessage: peer ? { id: peer.id, body: peer.body } : null,
    foreignOwnerMessages: stolen,
    noAuthStatus: noAuth.status,
    invalidTokenStatus: badToken.status,
  };
  console.log("verify", JSON.stringify(result));
  const ok =
    hasThread &&
    mine?.body === s.body &&
    peer?.body === s.body &&
    stolen === 0 &&
    noAuth.status === 401 &&
    badToken.status === 401;
  console.log(ok ? "E2_LIVE_PASS" : "E2_LIVE_FAIL");
  if (!ok) process.exitCode = 1;
}

const phase = process.argv[2];
if (phase === "seed") await seed();
else if (phase === "verify") await verify();
else throw new Error("usage: e2-live-restart.mts seed|verify");
