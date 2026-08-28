import assert from "node:assert/strict";
import test from "node:test";
import { EmailConnector } from "./email.js";

test("Email parseIngress normalizes addresses", async () => {
  const c = new EmailConnector();
  const body = {
    from: "Alice <Alice@Example.COM>",
    to: "inbox@elfcom.local",
    subject: "Ping",
    text: "Email body",
    messageId: "<msg-1@example.com>",
  };
  const parsed = await c.parseIngress({
    method: "POST",
    headers: {},
    query: {},
    body,
    rawBody: Buffer.from(JSON.stringify(body)),
  });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.peerHandle, "alice@example.com");
  assert.equal(parsed[0]!.draft.plaintextBody, "Email body");
});

test("Email live SendGrid HTTP delivery", async () => {
  const calls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
  const c = new EmailConnector({
    sendgridApiKey: "SG.test",
    fromAddress: "noreply@elfcom.local",
    fetchImpl: (async (url, init) => {
      calls.push({ url: String(url), headers: init?.headers });
      return new Response(null, {
        status: 202,
        headers: { "x-message-id": "sg-msg-1" },
      });
    }) as typeof fetch,
  });
  assert.equal(c.live, true);
  const out = await c.send({
    channel: "email",
    threadId: "t1",
    plaintextBody: "hello mail",
    peerHandle: "guest@hotel.example",
    peerRef: "email:guest@hotel.example",
    ownerTrustId: "TD-1",
  });
  assert.equal(out.providerMessageId, "sg-msg-1");
  assert.equal(calls[0]!.url, "https://api.sendgrid.com/v3/mail/send");
});

test("Email send stubs without credentials", async () => {
  const c = new EmailConnector();
  const out = await c.send({
    channel: "email",
    threadId: "t1",
    plaintextBody: "stub",
    peerRef: "email:stub",
    ownerTrustId: "TD-1",
  });
  assert.match(out.providerMessageId, /^email-stub-/);
});
