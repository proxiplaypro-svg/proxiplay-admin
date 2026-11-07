import test from "node:test";
import assert from "node:assert/strict";
import { mapReliableDashboard } from "./lib/admin/reliableDashboard";

const current = {
  schema_version: 2, source_complete: true, reference_date: "2026-10-28",
  registered_players: 1200, participations_yesterday: 610,
  participations_since_launch: 4200, active_games: 11,
};

test("a complete legacy consolidation can render the simplified dashboard", () => {
  const value = mapReliableDashboard(current, []);
  assert.equal(value.ready, true);
  assert.equal(value.referenceDate, "2026-10-28");
  assert.deepEqual(value.metrics, {
    registeredPlayers: 1200, uniquePlayersLastWeek: null, uniquePlayersLastMonth: null,
    inactivePlayersLastMonth: null, participationsYesterday: 610,
    participationsSinceLaunch: 4200, activeGames: 11,
  });
});

test("missing or failed consolidations are not ready", () => {
  assert.equal(mapReliableDashboard(null, []).ready, false);
  assert.equal(mapReliableDashboard({ ...current, source_complete: false }, []).ready, false);
  assert.equal(mapReliableDashboard({ computed_at: new Date(), temporal_complete: false }, []).ready, false);
});

test("an invalid value is unavailable, never 0", () => {
  const value = mapReliableDashboard({ ...current, active_games: -1, participations_yesterday: "610", registered_players: null }, []);
  assert.equal(value.metrics.activeGames, null);
  assert.equal(value.metrics.participationsYesterday, null);
  assert.equal(value.metrics.registeredPlayers, null);
});
