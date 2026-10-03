/**
 * E2 outage: Postgres reachable only through a local TCP forwarder that the test cuts.
 * Startup must fail closed, sends must fail during the outage, and the node must recover.
 * Skips when DATABASE_URL is unset.
 */
import assert from "node:assert/strict";
import { createSecretKey } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import * as jose from "jose";
import { computeZkBind, derivePhaseASessionKey } from "@elfcom/crypto";
import { PrismaClient } from "@prisma/client";

const dbUrl = process.env.DATABASE_URL;
const SECRET = process.env.LIFEOS_JWT_SECRET ?? "elfcom-dev-node-secret-change-me";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") return reject(new Error("no_port"));
      const port = addr.port;
      s.close(() => resolve(port));
    });
  });
}

class Forwarder {
  private server: net.Server | null = null;
  private sockets = new Set<net.Socket>();
  constructor(
    readonly port: number,
    private readonly host: string,
    private readonly targetPort: number,
  ) {}
  async up() {
    this.server = net.createServer((client) => {
      const upstream = net.connect(this.targetPort, this.host);
      for (const s of [client, upstream]) {
        this.sockets.add(s);
        s.on("close", () => this.sockets.delete(s));
        s.on("error", () => s.destroy());
      }
      client.pipe(upstream).pipe(client);
    });
    await new Promise<void>((r) => this.server!.listen(this.port, "127.0.0.1", () => r()));
  }
  async down() {
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
    if (this.server) await new Promise<void>((r) => this.server!.close(() => r()));
    this.server = null;
  }
}

function startNode(port: number, url: string): ChildProcess {
  return spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: url,
      ELFCOM_PORT: String(port),
      PORT: String(port),
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      LIFEOS_JWT_SECRET: SECRET,
      ELFCOM_NODE_MASTER_KEY:
        process.env.ELFCOM_NODE_MASTER_KEY ?? "0123456789abcdef0123456789abcdef",
    },
    stdio: ["ignore", "ignore", "ignore"],
  });
}

async function health(base: string) {
  const r = await fetch(`${base}/health`);
  return (await r.json()) as { messaging: { status: string; database: string; sourceOfTruth: string } };
}

async function waitFor(fn: () => Promise<boolean>, ms: number, label: string) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if (await fn()) return;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error(`timeout: ${label}`);
}

async function session(base: string, owner: string) {
  const sid = `e2-outage:${owner}:${Date.now()}`;
  const key = derivePhaseASessionKey(SECRET, owner, sid);
  const zk_bind = computeZkBind(key, { aud: "elfcom", sid, ownerTrustId: owner });
  const token = await new jose.SignJWT({
    sid,
    zk_bind,
    scp: ["thread:read", "thread:write", "message:send", "session:bind"],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("lifeos")
    .setAudience("elfcom")
    .setSubject(owner)
    .setExpirationTime("10m")
    .sign(createSecretKey(Buffer.from(SECRET, "utf8")));
  const r = await fetch(`${base}/v1/session/bind`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ sid, ownerTrustId: owner, zk_bind, sessionKeyBase64: key.toString("base64") }),
  });
  assert.equal(r.status, 204, await r.text());
  return token;
}

async function send(base: string, token: string, threadId: string, body: string, peer: string) {
  return fetch(`${base}/v1/threads/${encodeURIComponent(threadId)}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ body, peerRef: peer, channel: "dm" }),
  });
}

test("E2 outage: fail-closed startup, failed sends during outage, recovery after", async (t) => {
  if (!dbUrl) {
    t.skip("DATABASE_URL not set");
    return;
  }
  const target = new URL(dbUrl);
  const fwd = new Forwarder(await freePort(), target.hostname, Number(target.port || 5432));
  const viaFwd = new URL(dbUrl);
  viaFwd.hostname = "127.0.0.1";
  viaFwd.port = String(fwd.port);
  const nodePort = await freePort();
  const base = `http://127.0.0.1:${nodePort}`;
  const suffix = `${Date.now()}`;
  const A = `TD-E2-OUT-A-${suffix}`;
  const B = `TD-E2-OUT-B-${suffix}`;

  // 1. Fail closed: forwarder down at startup → process exits, never serves memory.
  const dead = startNode(nodePort, viaFwd.toString());
  const exitCode = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      dead.kill("SIGKILL");
      resolve(-999);
    }, 60_000);
    dead.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  assert.notEqual(exitCode, 0, "startup must fail when Postgres is unreachable");
  assert.notEqual(exitCode, -999, "node must exit instead of serving without Postgres");

  // 2. Normal operation through the forwarder.
  await fwd.up();
  const child = startNode(nodePort, viaFwd.toString());
  t.after(async () => {
    child.kill("SIGKILL");
    await fwd.down();
    const prisma = new PrismaClient();
    try {
      await prisma.message.deleteMany({ where: { ownerTrustId: { in: [A, B] } } });
      await prisma.thread.deleteMany({ where: { ownerTrustId: { in: [A, B] } } });
    } finally {
      await prisma.$disconnect();
    }
  });
  await waitFor(async () => (await health(base)).messaging.status === "READY", 60_000, "ready");

  const token = await session(base, A);
  const open = await fetch(`${base}/v1/dm/open`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ peerTrustId: B }),
  });
  const openText = await open.text();
  assert.equal(open.status, 200, openText);
  const threadId = (JSON.parse(openText) as { thread: { id: string } }).thread.id;
  const ok1 = await send(base, token, threadId, "before outage", B);
  assert.equal(ok1.status, 200, await ok1.text());

  // 3. Outage: health turns DEGRADED and sends fail without fake success.
  await fwd.down();
  await waitFor(
    async () => {
      const h = await health(base);
      return h.messaging.status === "DEGRADED" && h.messaging.database === "UNAVAILABLE";
    },
    30_000,
    "degraded",
  );
  assert.equal((await health(base)).messaging.sourceOfTruth, "postgres", "never switches to memory");
  const failed = await send(base, token, threadId, "during outage", B);
  assert.ok(failed.status >= 500, `send during outage must fail, got ${failed.status}`);

  // 4. Recovery.
  await fwd.up();
  await waitFor(async () => (await health(base)).messaging.status === "READY", 60_000, "recovered");
  let ok2: Response | undefined;
  await waitFor(
    async () => {
      ok2 = await send(base, token, threadId, "after outage", B);
      return ok2.status === 200;
    },
    60_000,
    "send after recovery",
  );
  const list = await fetch(`${base}/v1/threads/${encodeURIComponent(threadId)}/messages`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const bodies = ((await list.json()) as { messages: { body: string }[] }).messages.map((m) => m.body);
  assert.deepEqual(bodies, ["before outage", "after outage"], "failed send must leave no ghost message");
});
