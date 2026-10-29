/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test"); const assert = require("node:assert/strict");
const { rollingProjection, reconcilePlayerActivity, gameProjection } = require("../src/dashboard_stats/projections");
const now = Date.parse("2026-10-20T12:00:00Z"); const hour = 3600000;
test("exact 720h projection, correction and reconciliation", () => {
  const data = [{ active: true, player_hash: "a", participation_at_ms: now - 720 * hour }, { active: true, player_hash: "a", participation_at_ms: now - 1 }, { active: true, player_hash: "b", participation_at_ms: now - 720 * hour - 1 }];
  assert.deepEqual(rollingProjection(data, now), { participations_j30: 2, active_players_j30: 1, complete: true });
  assert.deepEqual(reconcilePlayerActivity(data, "a", now), { player_hash: "a", active_in_j30: true, last_played_at_ms: now - 1, needs_reconciliation: false });
});
test("private QR, expiry and merchant deduplication", () => {
  const base = { visible_public: true, start_date: new Date(now - 1), end_date: new Date(now + 1), enseigne_id: { path: "enseignes/a" } };
  assert.deepEqual(gameProjection([{ data: base }, { data: { ...base, access_mode: "qr_only" }, qrAccessState: "ready" }, { data: { ...base, access_mode: "qr_only" } }, { data: { ...base, end_date: new Date(now) } }], now), { active_games: 2, merchants_with_active_game: 1 });
});
