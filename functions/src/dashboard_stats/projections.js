/* eslint-disable @typescript-eslint/no-require-imports */
const { isParticipationInRolling30Days, gameInProgress, merchantIdentity } = require("./gameContract");

function rollingProjection(contributions, now = Date.now()) {
  const valid = contributions.filter((item) => item?.active === true && isParticipationInRolling30Days(item.participation_at_ms, now));
  const unresolved = contributions.some((item) => item?.active === true && item.needs_reconciliation === true);
  return { participations_j30: valid.length, active_players_j30: unresolved ? null : new Set(valid.map((item) => item.player_hash)).size, complete: !unresolved };
}

function reconcilePlayerActivity(contributions, playerHash, now = Date.now()) {
  const player = contributions.filter((item) => item?.active === true && item.player_hash === playerHash);
  const valid = player.filter((item) => isParticipationInRolling30Days(item.participation_at_ms, now));
  const latest = valid.reduce((max, item) => Math.max(max, item.participation_at_ms), -Infinity);
  return { player_hash: playerHash, active_in_j30: valid.length > 0, last_played_at_ms: Number.isFinite(latest) ? latest : null, needs_reconciliation: false };
}

function gameProjection(games, now = Date.now()) {
  const playable = games.filter((item) => gameInProgress(item.data ?? item, { now, qrAccessState: item.qrAccessState }).state === "playable");
  return { active_games: playable.length, merchants_with_active_game: new Set(playable.map((item) => merchantIdentity(item.data ?? item)).filter(Boolean)).size };
}

module.exports = { rollingProjection, reconcilePlayerActivity, gameProjection };
