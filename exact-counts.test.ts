import test from "node:test";
import assert from "node:assert/strict";
import {
  createExactCountCache,
  loadExactCounts,
  mapWithConcurrency,
} from "./lib/admin/exactCounts";

test("never more than the concurrency limit in flight, order preserved", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async (n) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    return n * 10;
  });
  assert.equal(maxInFlight, 3);
  assert.deepEqual(results, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
});

test("a failed count is null, never 0, and the others are kept", async () => {
  const counts = await loadExactCounts(["games/a", "games/b", "games/c"], async (key) => {
    if (key === "games/b") throw new Error("permission-denied");
    return key === "games/a" ? 0 : 42;
  });
  assert.equal(counts.get("games/a"), 0);
  assert.equal(counts.get("games/b"), null);
  assert.equal(counts.get("games/c"), 42);
});

test("cached games are not recounted; duplicates share one request", async () => {
  const cache = createExactCountCache(60_000);
  const calls: string[] = [];
  const count = async (key: string) => {
    calls.push(key);
    return 7;
  };
  await loadExactCounts(["games/a", "games/a", "games/b"], count, { cache });
  assert.deepEqual(calls.sort(), ["games/a", "games/b"]);
  await loadExactCounts(["games/a", "games/b", "games/c"], count, { cache });
  assert.deepEqual(calls.sort(), ["games/a", "games/b", "games/c"]);
});

test("failures are not cached and expired entries are recounted", async () => {
  let clock = 0;
  const cache = createExactCountCache(1_000, () => clock);
  let fail = true;
  const count = async () => {
    if (fail) throw new Error("unavailable");
    return 3;
  };
  assert.equal((await loadExactCounts(["games/a"], count, { cache })).get("games/a"), null);
  fail = false;
  assert.equal((await loadExactCounts(["games/a"], count, { cache })).get("games/a"), 3);
  fail = true;
  clock = 999;
  assert.equal((await loadExactCounts(["games/a"], count, { cache })).get("games/a"), 3);
  clock = 1_000;
  assert.equal((await loadExactCounts(["games/a"], count, { cache })).get("games/a"), null);
});
