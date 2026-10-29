/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateSixIndicators } = require("../src/dashboard_stats/consolidation");
const now = Date.parse("2026-10-20T12:00:00Z");
test("six indicators exclude ineligible, stale and indeterminate data", () => {
  const game = { visible_public: true, start_date: new Date(now - 1), end_date: new Date(now + 1), enseigne_id: { path: "enseignes/a" } };
  const value = calculateSixIndicators({ now, users: [{ user_role: "joueur" }, { user_role: "joueur", is_test_account: true }], activities: [{ player_hash: "a", last_played_at_ms: now - 1 }, { player_hash: "b", last_played_at_ms: now - 31 * 86400000 }], participations: [{ participation_date: new Date(now - 1) }, { participation_date: new Date(now - 31 * 86400000) }], games: [{ data: game }, { data: { ...game, access_mode: "qr_only", isPrivate: true }, qrAccessState: "ready" }, { data: { visible_public: true } }] });
  assert.deepEqual(value, { registered_players: 1, active_players_j30: 1, participations_today: 1, participations_j30: 1, active_games: 2, merchants_with_active_game: 1 });
});
