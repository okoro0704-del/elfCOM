import assert from "node:assert/strict";
import test from "node:test";
import type { ElfComChannel } from "@elfcom/contract";
import { RouterService } from "./router.service.js";

test("RouterService falls back when preferred channel fails", async () => {
  const calls: ElfComChannel[] = [];
  const router = new RouterService({
    maxAttemptsPerChannel: 2,
    baseBackoffMs: 1,
    sleep: async () => undefined,
    senders: {
      whatsapp: async () => {
        calls.push("whatsapp");
        throw new Error("wa_down");
      },
      telegram: async () => {
        calls.push("telegram");
        return { providerMessageId: "tg-1" };
      },
    },
  });

  const result = await router.route({
    recipientId: "TD-1",
    threadId: "t1",
    body: "hello",
    channel: "whatsapp",
    fallbackChannels: ["whatsapp", "telegram", "email"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.channel, "telegram");
  assert.equal(result.providerMessageId, "tg-1");
  assert.ok(calls.filter((c) => c === "whatsapp").length === 2);
  assert.ok(calls.includes("telegram"));
});

test("RouterService exhausts chain when all fail", async () => {
  const router = new RouterService({
    maxAttemptsPerChannel: 1,
    baseBackoffMs: 1,
    sleep: async () => undefined,
    senders: {
      whatsapp: async () => {
        throw new Error("fail");
      },
      telegram: async () => {
        throw new Error("fail");
      },
    },
  });
  const result = await router.route({
    recipientId: "TD-1",
    threadId: "t1",
    body: "x",
    channel: "whatsapp",
    fallbackChannels: ["whatsapp", "telegram"],
  });
  assert.equal(result.ok, false);
  assert.equal(result.attempts.length, 2);
});
