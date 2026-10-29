import test from "node:test";
import assert from "node:assert/strict";
import { mapReliableDashboard } from "./lib/admin/reliableDashboard";

const current = {
  schema_version: 2, source_complete: true, reference_date: "2026-10-28",
  registered_players: 1200, players_yesterday: 140, participations_yesterday: 610,
  merchants_with_active_game: 9, active_games: 11,
};

test("a complete schema 2 consolidation is ready, with its five indicators", () => {
  const value = mapReliableDashboard(current, []);
  assert.equal(value.ready, true);
  assert.equal(value.referenceDate, "2026-10-28");
  assert.deepEqual(value.metrics, { registeredPlayers: 1200, playersYesterday: 140, participationsYesterday: 610, merchantsWithActiveGame: 9, activeGames: 11 });
});

test("missing, failed or old consolidations are never ready", () => {
  assert.equal(mapReliableDashboard(null, []).ready, false);
  assert.equal(mapReliableDashboard({ ...current, source_complete: false }, []).ready, false);
  assert.equal(mapReliableDashboard({ ...current, schema_version: 1 }, []).ready, false);
  // What the failing production run of 29/10 left: computed_at and temporal_complete only.
  assert.equal(mapReliableDashboard({ computed_at: new Date(), temporal_complete: false }, []).ready, false);
});

test("an invalid value is unavailable, never 0", () => {
  const value = mapReliableDashboard({ ...current, active_games: -1, players_yesterday: "140", registered_players: null }, []);
  assert.equal(value.metrics.activeGames, null);
  assert.equal(value.metrics.playersYesterday, null);
  assert.equal(value.metrics.registeredPlayers, null);
});

test("daily series: Paris day ids only, chronological, at most 30 days", () => {
  const days = Array.from({ length: 35 }, (_, index) => {
    const day = new Date(Date.UTC(2026, 8, 24 + index)).toISOString().slice(0, 10);
    return { id: day, data: { participations_count: index, unique_players_count: index === 34 ? "x" : index } };
  }).reverse();
  const value = mapReliableDashboard(current, [...days, { id: "legacy-doc", data: { participations_count: 1 } }]);
  assert.equal(value.daily.length, 30);
  assert.equal(value.daily[0].day, "2026-09-29");
  assert.equal(value.daily.at(-1)!.day, "2026-10-28");
  assert.equal(value.daily.at(-1)!.participations, 34);
  assert.equal(value.daily.at(-1)!.uniquePlayers, null);
});
