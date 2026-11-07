import test from "node:test";
import assert from "node:assert/strict";
import { mapReliableDashboard } from "./lib/admin/reliableDashboard";

test("the Dashboard maps closed-period metrics and keeps incomplete values unavailable", () => {
  const complete = mapReliableDashboard({
    schema_version: 3, source_complete: true, reference_date: "2026-10-28",
    registered_players: 10, weekly_source_complete: true, weekly_unique_players: 4,
    monthly_source_complete: true, monthly_unique_players: 6, monthly_inactive_players: 4,
    weekly_period_start: "2026-10-19", weekly_period_end: "2026-10-26",
    monthly_period_start: "2026-10-01", monthly_period_end: "2026-11-01",
    participations_yesterday: 9, participations_since_launch: 99, active_games: 2,
  }, []);
  assert.equal(complete.ready, true);
  assert.deepEqual(complete.metrics, {
    registeredPlayers: 10, uniquePlayersLastWeek: 4, uniquePlayersLastMonth: 6, inactivePlayersLastMonth: 4,
    participationsYesterday: 9, participationsSinceLaunch: 99, activeGames: 2,
  });
  assert.deepEqual(complete.weeklyPeriod, { start: "2026-10-19", end: "2026-10-26" });
  assert.deepEqual(complete.monthlyPeriod, { start: "2026-10-01", end: "2026-11-01" });

  const incomplete = mapReliableDashboard({ schema_version: 3, source_complete: false, weekly_source_complete: false, monthly_source_complete: false }, []);
  assert.equal(incomplete.ready, false);
  assert.equal(incomplete.metrics.uniquePlayersLastWeek, null);
  assert.equal(incomplete.metrics.uniquePlayersLastMonth, null);
  assert.equal(incomplete.metrics.inactivePlayersLastMonth, null);
});
