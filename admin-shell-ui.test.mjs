import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the main dashboard no longer falls back to the legacy dashboard", () => {
  const source = readFileSync("app/admin/dashboard/page.tsx", "utf8");
  assert.match(source, /ReliableDashboard/);
  assert.doesNotMatch(source, /LegacyDashboard/);
  assert.match(source, /unavailableDashboard/);
});
