import assert from "node:assert/strict";
import test from "node:test";
import {
  SessionBinder,
  computeZkBind,
  openUtf8,
  randomSessionKey,
  seal,
} from "./index.js";

test("SessionBinder bind/open seals ingress under ZK session key", () => {
  const binder = new SessionBinder({ aud: "elfcom" });
  const sessionKey = randomSessionKey();
  const ownerTrustId = "TD-TEST001";
  const sid = "sess-1";
  const zk_bind = computeZkBind(sessionKey, {
    aud: "elfcom",
    sid,
    ownerTrustId,
  });

  binder.bind({ sid, ownerTrustId, zk_bind, sessionKey });

  const createdAt = new Date().toISOString();
  const sealed = binder.sealIngressPacket(
    sid,
    {
      packetId: "pkt-1",
      channel: "dm",
      providerMessageId: "p1",
      ownerTrustId,
      threadKey: "t1",
      sentAt: createdAt,
      fromRef: "a",
      toRef: "b",
      contentType: "text",
      plaintextBody: "hello sovereign",
      rawProviderMetaHash: "abc",
    },
    { threadId: "thread-1", messageId: "msg-1" },
  );

  const opened = binder.openWithSession(
    sid,
    sealed,
    {
      ownerTrustId,
      threadId: "thread-1",
      messageId: "msg-1",
      channel: "dm",
      createdAt,
    },
    zk_bind,
  );
  assert.equal(opened, "hello sovereign");

  binder.unbind(sid);
  assert.equal(binder.get(sid), null);
});

test("reject wrong zk_bind", () => {
  const binder = new SessionBinder();
  const sessionKey = randomSessionKey();
  assert.throws(() =>
    binder.bind({
      sid: "s",
      ownerTrustId: "td",
      zk_bind: "deadbeef",
      sessionKey,
    }),
  );
});

test("user seal/open with AAD", () => {
  const key = randomSessionKey();
  const aad = {
    ownerTrustId: "td",
    threadId: "t",
    messageId: "m",
    channel: "bus",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const blob = seal("ping", key, aad, "kid-1");
  assert.equal(openUtf8(blob, key, aad), "ping");
});
