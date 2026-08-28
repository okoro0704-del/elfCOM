import assert from "node:assert/strict";
import test from "node:test";
import { WebSocketService } from "./websocket.service.js";

test("WebSocketService fans out events to matching userId", () => {
  const hub = new WebSocketService();
  const sent: string[] = [];
  const fake = {
    readyState: 1,
    send: (data: string) => {
      sent.push(data);
    },
    on: () => fake,
  };
  hub.__addTestClient({
    socket: fake as unknown as import("ws").WebSocket,
    userId: "TD-A",
  });
  hub.__addTestClient({
    socket: {
      readyState: 1,
      send: () => {
        throw new Error("should not receive");
      },
      on: () => undefined,
    } as unknown as import("ws").WebSocket,
    userId: "TD-B",
  });

  hub.emit({
    typ: "message.created",
    userId: "TD-A",
    threadId: "t1",
    ts: new Date().toISOString(),
  });

  assert.equal(sent.length, 1);
  const parsed = JSON.parse(sent[0]!) as { typ: string; userId: string };
  assert.equal(parsed.typ, "message.created");
  assert.equal(parsed.userId, "TD-A");
});
