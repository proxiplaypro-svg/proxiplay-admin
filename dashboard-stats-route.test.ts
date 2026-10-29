import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dailyDocumentIds } from "./lib/admin/reliableDashboard";

// Regression (29/10/2026): the route ordered analytics_daily by document id
// descending. Firestore rejects that query without a dedicated index
// (FAILED_PRECONDITION), the route answered 500 and /admin/dashboard silently
// kept the former dashboard although dashboard_stats/current was complete.

test("the route reads analytics_daily by known ids, never with an ordered query", () => {
  const source = readFileSync("app/api/admin/dashboard-stats/route.ts", "utf8");
  assert.doesNotMatch(source, /orderBy\(/, "an ordered query may need an index");
  assert.match(source, /getAll\(/);
  assert.match(source, /dailyDocumentIds\(/);
});

test("30 Paris day ids ending at the reference date, oldest first", () => {
  const ids = dailyDocumentIds("2026-10-28");
  assert.equal(ids.length, 30);
  assert.equal(ids[0], "2026-09-29");
  assert.equal(ids.at(-1), "2026-10-28");
  assert.equal(new Set(ids).size, 30);
});

test("month, year and daylight-saving boundaries keep one id per day", () => {
  // 25/10/2026: switch to winter time in Paris.
  assert.deepEqual(dailyDocumentIds("2026-10-26", 3), ["2026-10-24", "2026-10-25", "2026-10-26"]);
  assert.deepEqual(dailyDocumentIds("2027-01-01", 2), ["2026-12-31", "2027-01-01"]);
  assert.deepEqual(dailyDocumentIds("2028-03-01", 2), ["2028-02-29", "2028-03-01"]);
});

test("no reference date or an invalid one: no daily read", () => {
  assert.deepEqual(dailyDocumentIds(null), []);
  assert.deepEqual(dailyDocumentIds("28/10/2026"), []);
  assert.deepEqual(dailyDocumentIds("2026-02-30"), []);
});
