/**
 * E2 decisive test: real OS process kill/restart — messages must survive in Postgres.
 * Skips when DATABASE_URL is unset.
 */
import assert from "node:assert/strict";
import { createSecretKey } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as jose from "jose";
import { computeZkBind, derivePhaseASessionKey } from "@elfcom/crypto";
import { PrismaClient } from "@prisma/client";

const hasDb = Boolean(process.env.DATABASE_URL);
const SECRET = process.env.LIFEOS_JWT_SECRET ?? "elfcom-dev-node-secret-change-me";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") {
        s.close();
        reject(new Error("no_port"));
        return;
      }
      const port = addr.port;
      s.close(() => resolve(port));
    });
  });
}

async function mint(owner: string, sid: string) {
  const sessionKey = derivePhaseASessionKey(SECRET, owner, sid);
  const zk_bind = computeZkBind(sessionKey, { aud: "elfcom", sid, ownerTrustId: owner });
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
    .setExpirationTime("10m")
    .sign(createSecretKey(Buffer.from(SECRET, "utf8")));
  return { token, zk_bind, sessionKeyBase64: sessionKey.toString("base64"), sid };
}

async function waitHealth(base: string, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/health`);
      last = await r.text();
      if (r.ok) {
        const j = JSON.parse(last) as {
          messaging?: { sourceOfTruth?: string; database?: string };
        };
        if (j.messaging?.sourceOfTruth === "postgres") return j;
      }
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error(`health_timeout: ${last}`);
}

function startNode(port: number): ChildProcess {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL required for restart test");
  }
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        ELFCOM_PORT: String(port),
        PORT: String(port),
        HOST: "127.0.0.1",
        // Fail closed — never pretend memory is durable during this test.
        NODE_ENV: "production",
        ELFCOM_DEV_AUTO_BIND: "true",
        LIFEOS_JWT_SECRET: SECRET,
        ELFCOM_NODE_MASTER_KEY:
          process.env.ELFCOM_NODE_MASTER_KEY ?? "0123456789abcdef0123456789abcdef",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", () => {});
  return child;
}

async function killHard(child: ChildProcess) {
  if (child.killed || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await sleep(500);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
  await sleep(300);
}

test("E2 process restart: Postgres message survives real node kill", async (t) => {
  if (!hasDb) {
    t.skip("DATABASE_URL not set");
    return;
  }

  // Wait for flaky Railway TCP proxy before spawning the node
  {
    const probe = new PrismaClient();
    let ready = false;
    for (let i = 0; i < 15; i++) {
      try {
        await probe.$queryRaw`SELECT 1`;
        ready = true;
        break;
      } catch {
        await sleep(1000);
      }
    }
    await probe.$disconnect();
    if (!ready) {
      t.skip("Postgres unreachable via DATABASE_URL");
      return;
    }
  }

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const suffix = `${Date.now()}`;
  const A = `TD-E2-RST-A-${suffix}`;
  const B = `TD-E2-RST-B-${suffix}`;
  const body = `persist me ${suffix}`;

  let child = startNode(port);
  t.after(async () => {
    await killHard(child);
    const prisma = new PrismaClient();
    try {
      await prisma.message.deleteMany({ where: { ownerTrustId: { in: [A, B] } } });
      await prisma.thread.deleteMany({ where: { ownerTrustId: { in: [A, B] } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  await waitHealth(base);

  const sid1 = `e2-rst:${A}:${suffix}`;
  const bound1 = await mint(A, sid1);
  const bind1 = await fetch(`${base}/v1/session/bind`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bound1.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sid: bound1.sid,
      ownerTrustId: A,
      zk_bind: bound1.zk_bind,
      sessionKeyBase64: bound1.sessionKeyBase64,
    }),
  });
  assert.equal(bind1.status, 204, await bind1.text());
  const tokenA = bound1.token;

  const open = await fetch(`${base}/v1/dm/open`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${tokenA}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ peerTrustId: B }),
  });
  const openText = await open.text();
  assert.equal(open.status, 200, openText);
  const openJson = JSON.parse(openText) as { thread: { id: string } };
  const threadId = openJson.thread.id;

  const send = await fetch(`${base}/v1/threads/${encodeURIComponent(threadId)}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${tokenA}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ body, peerRef: B, channel: "dm" }),
  });
  const sendText = await send.text();
  assert.equal(send.status, 200, sendText);
  const sentWrap = JSON.parse(sendText) as { message: { id: string; body: string } };
  const sent = sentWrap.message;
  assert.ok(sent?.id, sendText);
  assert.equal(sent.body, body);

  // Hard kill — clears all process memory
  const pid = child.pid;
  await killHard(child);
  assert.ok(pid, "child had pid");

  // Fresh process
  child = startNode(port);
  await waitHealth(base);

  const sid2 = `e2-rst2:${A}:${suffix}`;
  const bound2 = await mint(A, sid2);
  const bind2 = await fetch(`${base}/v1/session/bind`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bound2.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sid: bound2.sid,
      ownerTrustId: A,
      zk_bind: bound2.zk_bind,
      sessionKeyBase64: bound2.sessionKeyBase64,
    }),
  });
  assert.equal(bind2.status, 204, await bind2.text());
  const tokenA2 = bound2.token;

  const inbox = await fetch(`${base}/v1/inbox`, {
    headers: { authorization: `Bearer ${tokenA2}` },
  });
  const inboxText = await inbox.text();
  assert.equal(inbox.status, 200, inboxText);
  const inboxJson = JSON.parse(inboxText) as { threads: { id: string }[] };
  assert.ok(
    inboxJson.threads.some((th) => th.id === threadId),
    "inbox must contain durable thread after restart",
  );

  const msgs = await fetch(
    `${base}/v1/threads/${encodeURIComponent(threadId)}/messages`,
    { headers: { authorization: `Bearer ${tokenA2}` } },
  );
  const msgsText = await msgs.text();
  assert.equal(msgs.status, 200, msgsText);
  const list = JSON.parse(msgsText) as { messages: { id: string; body: string }[] };
  assert.ok(
    list.messages.some((m) => m.id === sent.id && m.body === body),
    `expected durable message "${body}" id=${sent.id}`,
  );
});
