import assert from "node:assert/strict";
import test from "node:test";
import { WhatsAppConnector } from "./whatsapp.js";

test("WhatsApp parseIngress extracts text message", async () => {
  const c = new WhatsAppConnector({ verifyToken: "tok" });
  const body = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { display_phone_number: "15550001111", phone_number_id: "pnid" },
              messages: [
                {
                  from: "15551234567",
                  id: "wamid.ABC",
                  timestamp: "1710000000",
                  type: "text",
                  text: { body: "Hello from WA" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const parsed = await c.parseIngress({
    method: "POST",
    headers: {},
    query: {},
    body,
    rawBody: Buffer.from(JSON.stringify(body)),
  });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.peerHandle, "15551234567");
  assert.equal(parsed[0]!.draft.plaintextBody, "Hello from WA");
  assert.equal(parsed[0]!.draft.channel, "whatsapp");
});

test("WhatsApp verification challenge", async () => {
  const c = new WhatsAppConnector({ verifyToken: "secret" });
  const res = await c.handleVerification!({
    method: "GET",
    headers: {},
    query: { "hub.mode": "subscribe", "hub.verify_token": "secret", "hub.challenge": "12345" },
  });
  assert.equal(res?.kind, "challenge");
  if (res?.kind === "challenge") assert.equal(res.body, "12345");
});

test("WhatsApp live Graph send uses phone_number_id messages endpoint", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const c = new WhatsAppConnector({
    verifyToken: "tok",
    accessToken: "EAA_test",
    phoneNumberId: "1099887766",
    fetchImpl: (async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.LIVE1" }] }), { status: 200 });
    }) as typeof fetch,
  });
  assert.equal(c.live, true);
  const out = await c.send({
    channel: "whatsapp",
    threadId: "t1",
    plaintextBody: "hi live",
    peerHandle: "+1 (555) 123-4567",
    peerRef: "wa:15551234567",
    ownerTrustId: "TD-1",
  });
  assert.equal(out.providerMessageId, "wamid.LIVE1");
  assert.match(calls[0]!.url, /graph\.facebook\.com\/v18\.0\/1099887766\/messages/);
  assert.equal((calls[0]!.body as { to: string }).to, "15551234567");
});

test("WhatsApp send stubs without credentials", async () => {
  const c = new WhatsAppConnector({ verifyToken: "tok" });
  const out = await c.send({
    channel: "whatsapp",
    threadId: "t1",
    plaintextBody: "stub",
    peerRef: "wa:stub",
    ownerTrustId: "TD-1",
  });
  assert.match(out.providerMessageId, /^wa-stub-/);
});
