import assert from "node:assert/strict";
import test from "node:test";
import { TelegramConnector } from "./telegram.js";

test("Telegram parseIngress extracts chat message", async () => {
  const c = new TelegramConnector();
  const body = {
    update_id: 1,
    message: {
      message_id: 42,
      date: 1710000000,
      text: "hi tg",
      chat: { id: 999 },
      from: { id: 888 },
    },
  };
  const parsed = await c.parseIngress({
    method: "POST",
    headers: {},
    query: {},
    body,
    rawBody: Buffer.from(JSON.stringify(body)),
  });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.draft.plaintextBody, "hi tg");
  assert.equal(parsed[0]!.draft.providerMessageId, "42");
  assert.match(parsed[0]!.peerHandle, /^telegram:user:888/);
});

test("Telegram live Bot API sendMessage", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const c = new TelegramConnector({
    botToken: "123:ABC",
    fetchImpl: (async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), {
        status: 200,
      });
    }) as typeof fetch,
  });
  assert.equal(c.live, true);
  const out = await c.send({
    channel: "telegram",
    threadId: "t1",
    plaintextBody: "ping",
    peerHandle: "telegram:chat:42",
    peerRef: "tg:42",
    ownerTrustId: "TD-1",
  });
  assert.equal(out.providerMessageId, "77");
  assert.match(calls[0]!.url, /api\.telegram\.org\/bot123:ABC\/sendMessage/);
  assert.equal((calls[0]!.body as { chat_id: string }).chat_id, "42");
});
