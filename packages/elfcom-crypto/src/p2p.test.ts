import assert from "node:assert/strict";
import test from "node:test";
import { P2pKeyExchange, SessionBinder } from "./index.js";

test("P2pKeyExchange signs and verifies envelopes", () => {
  const alice = P2pKeyExchange.generateKeyPair();
  const bob = P2pKeyExchange.generateKeyPair();
  const exchange = new P2pKeyExchange();
  exchange.registerPublicKey("TD-ALICE", alice.publicKeyPem);
  exchange.registerPublicKey("TD-BOB", bob.publicKeyPem);

  const unsigned = {
    fromTrustId: "TD-ALICE",
    toTrustId: "TD-BOB",
    threadId: "dm-1",
    payloadBase64: Buffer.from("hello bob").toString("base64"),
    createdAt: new Date().toISOString(),
  };
  const signed = exchange.signEnvelope(alice.privateKeyPem, unsigned);
  assert.equal(exchange.verifyEnvelope(signed), true);

  const tampered = { ...signed, payloadBase64: Buffer.from("evil").toString("base64") };
  assert.equal(exchange.verifyEnvelope(tampered), false);
});

test("SessionBinder.requireP2pEnvelope rejects unknown peers", () => {
  const binder = new SessionBinder();
  const keys = P2pKeyExchange.generateKeyPair();
  const exchange = new P2pKeyExchange();
  const signed = exchange.signEnvelope(keys.privateKeyPem, {
    fromTrustId: "TD-X",
    toTrustId: "TD-Y",
    threadId: "t",
    payloadBase64: "YQ==",
    createdAt: new Date().toISOString(),
  });
  assert.throws(
    () => binder.requireP2pEnvelope(signed),
    (err: unknown) =>
      err instanceof Error &&
      err.name === "SessionBindError" &&
      (err as { code?: string }).code === "p2p_signature_invalid",
  );
  binder.registerPeerPublicKey("TD-X", keys.publicKeyPem);
  binder.requireP2pEnvelope(signed);
});
