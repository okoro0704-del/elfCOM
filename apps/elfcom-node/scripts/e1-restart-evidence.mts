/** After node restart, memory SoT must be empty. */
import assert from "node:assert/strict";
import { createSecretKey } from "node:crypto";
import * as jose from "jose";
import { computeZkBind, derivePhaseASessionKey } from "@elfcom/crypto";

const BASE = process.env.ELFCOM_E1_BASE ?? "http://127.0.0.1:8791";
const SECRET = process.env.LIFEOS_JWT_SECRET ?? "elfcom-dev-node-secret-change-me";
const owner = "TD-E1-LIVE-A";

async function main() {
  const sid = `e1restart:${owner}`;
  const sk = derivePhaseASessionKey(SECRET, owner, sid);
  const zk = computeZkBind(sk, { aud: "elfcom", sid, ownerTrustId: owner });
  const t = await new jose.SignJWT({
    sid,
    zk_bind: zk,
    scp: ["thread:read", "session:bind"],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("lifeos")
    .setAudience("elfcom")
    .setSubject(owner)
    .setExpirationTime("5m")
    .sign(createSecretKey(Buffer.from(SECRET)));

  await fetch(`${BASE}/v1/session/bind`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      sid,
      ownerTrustId: owner,
      zk_bind: zk,
      sessionKeyBase64: sk.toString("base64"),
    }),
  });
  const r = await fetch(`${BASE}/v1/inbox?channel=dm`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  const j = (await r.json()) as { threads: unknown[] };
  console.log(`AFTER_RESTART_THREADS=${j.threads?.length ?? 0}`);
  assert.equal(j.threads?.length ?? 0, 0, "memory SoT must be empty after restart");
  console.log("E1_RESTART_MEMORY_EMPTY=PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
