/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("dashboard keeps its production consolidation and schedules closed periods in Paris", () => {
  const source = fs.readFileSync("functions/src/dashboard_stats/automations.js", "utf8");
  assert.match(source, /dashboardStatsConsolidation = onSchedule\(\{ schedule: "0 3 \* \* \*"/);
  assert.match(source, /dashboardWeeklyUniquePlayers = onSchedule\(\{ schedule: "0 2 \* \* 1"/);
  assert.match(source, /dashboardMonthlyUniquePlayers = onSchedule\(\{ schedule: "0 3 1 \* \*"/);
  assert.match(source, /timeZone:\s*"Europe\/Paris"/);
});
