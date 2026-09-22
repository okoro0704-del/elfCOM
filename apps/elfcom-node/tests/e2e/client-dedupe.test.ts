/**
 * Client-side message merge/dedupe rules (mirrors apps/web/src/lib/elfcomApi.ts).
 */
import assert from "node:assert/strict";
import test from "node:test";

type Msg = { id: string; threadId: string; body: string; senderId: string; createdAt: string };

function mergeMessagesById(existing: Msg[], incoming: Msg[]): Msg[] {
  const map = new Map<string, Msg>();
  for (const m of existing) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

test("REST + WS does not duplicate by server message id", () => {
  const a: Msg = {
    id: "m1",
    threadId: "t1",
    body: "hi",
    senderId: "A",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const merged = mergeMessagesById([a], [{ ...a }]);
  assert.equal(merged.length, 1);
});

test("messages order by createdAt then id", () => {
  const merged = mergeMessagesById(
    [{ id: "b", threadId: "t", body: "2", senderId: "A", createdAt: "2026-01-01T00:00:02.000Z" }],
    [{ id: "a", threadId: "t", body: "1", senderId: "B", createdAt: "2026-01-01T00:00:01.000Z" }],
  );
  assert.deepEqual(
    merged.map((m) => m.id),
    ["a", "b"],
  );
});
