import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlayerPushBatches,
  classifyPlayerPushError,
  runPlayerPushBatches,
} from "./lib/firebase/playerPushBatches";

test("1,421 players become 29 ordered batches of at most 50 canonical paths", () => {
  const batches = buildPlayerPushBatches(Array.from({ length: 1421 }, (_, index) => `uid-${index}`));
  assert.equal(batches.length, 29);
  assert.equal(batches[0].userRefs[0], "users/uid-0");
  assert.equal(batches[27].uids.length, 50);
  assert.equal(batches[28].uids.length, 21);
  assert.equal(batches[28].userRefs.at(-1), "users/uid-1420");
});

test("duplicates are removed and malformed references fail before any call", () => {
  assert.deepEqual(buildPlayerPushBatches(["uid-1", "users/uid-1", " uid-2 "])[0].userRefs,
    ["users/uid-1", "users/uid-2"]);
  assert.throws(() => buildPlayerPushBatches(["uid-1", "users/bad/path"]), /invalide/);
  assert.throws(() => buildPlayerPushBatches([]), /invalide/);
});

test("test mode selections of one to five stay in one batch", () => {
  for (let count = 1; count <= 5; count++) {
    assert.equal(buildPlayerPushBatches(Array.from({ length: count }, (_, index) => `tester-${index}`)).length, 1);
  }
});

test("calls are sequential; each result is retained without retry", async () => {
  const batches = buildPlayerPushBatches(Array.from({ length: 105 }, (_, index) => `uid-${index}`));
  const events: string[] = [];
  const reported: string[] = [];
  let call = 0;
  const results = await runPlayerPushBatches(batches, async (refs) => {
    call++;
    events.push(`start-${call}`);
    assert.ok(refs.length <= 50);
    await Promise.resolve();
    events.push(`end-${call}`);
    if (call === 1) return { ok: true, id: "document-1" };
    if (call === 2) throw Object.assign(new Error("Argument refusé"), { code: "functions/invalid-argument" });
    throw Object.assign(new Error("Délai dépassé"), { code: "functions/deadline-exceeded" });
  }, (result) => reported.push(result.status));

  assert.deepEqual(events, ["start-1", "end-1", "start-2", "end-2", "start-3", "end-3"]);
  assert.deepEqual(reported, ["created", "error", "uncertain"]);
  assert.equal(results[0].documentId, "document-1");
  assert.equal(results[1].uids.length, 50);
  assert.equal(results[2].uids.length, 5);
  assert.equal(call, 3);
});

test("a malformed success response is uncertain, as are unknown transport errors", async () => {
  const results = await runPlayerPushBatches(buildPlayerPushBatches(["uid"]),
    async () => ({ ok: true, id: "" }), () => {});
  assert.equal(results[0].status, "uncertain");
  assert.equal(classifyPlayerPushError(new Error("network unavailable")), "uncertain");
  assert.equal(classifyPlayerPushError({ code: "functions/permission-denied" }), "error");
});
