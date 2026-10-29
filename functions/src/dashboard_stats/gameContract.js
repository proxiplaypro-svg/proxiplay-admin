// This deployed copy must stay self-contained: Firebase packages only the
// `functions` directory, so it cannot resolve the Admin's root `shared/` file.
const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLING_30_DAYS_MS = 30 * DAY_MS;
const CLOSED_STATUSES = new Set(["cancelled", "canceled", "annule", "annulé", "disabled", "desactive", "désactivé", "deleted", "supprime", "supprimé"]);
const DRAFT_STATUSES = new Set(["brouillon", "draft"]);
const ENDED_STATUSES = new Set(["ended", "termine", "terminé", "expire", "expiré"]);

function normalizedStatus(value) { return typeof value === "string" ? value.trim().toLowerCase() : ""; }
function finiteNumber(value) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function toMillis(value) {
  if (value instanceof Date) return finiteNumber(value.getTime());
  const numeric = finiteNumber(value);
  if (numeric !== null) return numeric;
  if (value && typeof value.toMillis === "function") return finiteNumber(value.toMillis());
  if (value && typeof value === "object") {
    const seconds = finiteNumber(value.seconds ?? value._seconds);
    const nanoseconds = finiteNumber(value.nanoseconds ?? value._nanoseconds) ?? 0;
    if (seconds !== null) return seconds * 1000 + nanoseconds / 1e6;
  }
  return null;
}
function isEligibleRegisteredPlayer(user) { return user?.user_role === "joueur" && user.is_test_account !== true && user.is_deleted !== true; }
function participationMillis(value) {
  if (value && typeof value === "object" && !(value instanceof Date) && typeof value.toMillis !== "function") return toMillis(value.participation_date);
  return toMillis(value);
}
function isParticipationInRolling30Days(value, now = Date.now()) {
  const timestamp = participationMillis(value);
  const nowMs = toMillis(now);
  return timestamp !== null && nowMs !== null && timestamp >= nowMs - ROLLING_30_DAYS_MS && timestamp <= nowMs;
}
function parisDayKey(value) {
  const millis = toMillis(value);
  if (millis === null) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(millis));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  const year = part("year"); const month = part("month"); const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}
function merchantIdentity(game) {
  const ref = game?.enseigne_id ?? game?.enseigne_ref ?? game?.merchantRef;
  if (ref && typeof ref.path === "string" && /^enseignes\/[^/]+$/.test(ref.path)) return ref.path;
  if (ref && typeof ref.id === "string" && ref.id.trim()) return `enseignes/${ref.id.trim()}`;
  for (const candidate of [game?.merchantId, game?.merchant_id]) if (typeof candidate === "string" && candidate.trim()) return `enseignes/${candidate.trim()}`;
  return null;
}
function hasLaunchEvidence(game) {
  const uniquePlayers = finiteNumber(game?.unique_players_count);
  return uniquePlayers !== null ? uniquePlayers >= 10 : (finiteNumber(game?.participations) ?? 0) >= 20;
}
function gamePublicationState(game) {
  const status = normalizedStatus(game?.status);
  if (game?.deleted === true || CLOSED_STATUSES.has(status)) return "disabled";
  if (game?.visible_public === false && game?.visible_public_auto_published === true) return "hidden";
  if (game?.visible_public !== false && !DRAFT_STATUSES.has(status)) return "published";
  return hasLaunchEvidence(game) ? "published_inconsistent" : "draft";
}
function gameDateMillis(game, first, second) { return toMillis(game?.[first]) ?? toMillis(game?.[second]); }
function gameInProgress(game, { now = Date.now(), qrAccessState } = {}) {
  const nowMs = toMillis(now);
  if (nowMs === null) return { state: "indeterminate", reason: "invalid_now" };
  const publication = gamePublicationState(game);
  if (["disabled", "hidden", "draft"].includes(publication)) return { state: "not_playable", reason: publication };
  const startMs = gameDateMillis(game, "start_date", "startDate"); const endMs = gameDateMillis(game, "end_date", "endDate");
  if (startMs === null || endMs === null) return { state: "indeterminate", reason: "missing_dates" };
  if (startMs > nowMs) return { state: "not_playable", reason: "not_started" };
  if (endMs <= nowMs) return { state: "not_playable", reason: "ended" };
  if (ENDED_STATUSES.has(normalizedStatus(game?.status))) return { state: "indeterminate", reason: "ended_status_conflicts_with_dates" };
  const qrOnly = game?.access_mode === "qr_only";
  const privateFlag = qrOnly || game?.isPrivate === true || ["prive", "privé", "private"].includes(normalizedStatus(game?.status));
  if (!privateFlag) return { state: "playable", reason: "public" };
  if (!qrOnly) return { state: "indeterminate", reason: "private_access_not_proven" };
  if (qrAccessState === "ready") return { state: "playable", reason: "qr_access_ready" };
  if (["missing", "regeneration-required", "ended"].includes(qrAccessState)) return { state: "not_playable", reason: `qr_${qrAccessState}` };
  return { state: "indeterminate", reason: "qr_access_not_checked" };
}

module.exports = { DAY_MS, ROLLING_30_DAYS_MS, toMillis, isEligibleRegisteredPlayer, isParticipationInRolling30Days, parisDayKey, merchantIdentity, gamePublicationState, gameInProgress };
