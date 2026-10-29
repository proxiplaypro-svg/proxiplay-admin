/**
 * Pure, runtime-neutral business rules for the future Admin Dashboard.
 *
 * This module deliberately has no Firestore, Firebase, Next.js or browser
 * dependency. It is not wired to the current dashboard nor to deployed Cloud
 * Functions: adopting it is a later, explicit migration.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLING_30_DAYS_MS = 30 * DAY_MS;
const CLOSED_STATUSES = new Set([
  "cancelled", "canceled", "annule", "annulé", "disabled", "desactive",
  "désactivé", "deleted", "supprime", "supprimé",
]);
const DRAFT_STATUSES = new Set(["brouillon", "draft"]);
const ENDED_STATUSES = new Set(["ended", "termine", "terminé", "expire", "expiré"]);

function normalizedStatus(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Converts Date, Firestore Timestamp-like values and epoch milliseconds. */
function toMillis(value) {
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? millis : null;
  }
  const numeric = finiteNumber(value);
  if (numeric !== null) return numeric;
  if (value && typeof value.toMillis === "function") {
    const millis = value.toMillis();
    return finiteNumber(millis);
  }
  if (value && typeof value === "object") {
    const seconds = finiteNumber(value.seconds ?? value._seconds);
    const nanoseconds = finiteNumber(value.nanoseconds ?? value._nanoseconds) ?? 0;
    if (seconds !== null) return seconds * 1000 + nanoseconds / 1e6;
  }
  return null;
}

function isEligibleRegisteredPlayer(user) {
  return user?.user_role === "joueur" && user.is_test_account !== true && user.is_deleted !== true;
}

function participationMillis(participationOrDate) {
  if (participationOrDate && typeof participationOrDate === "object" &&
      !(participationOrDate instanceof Date) && typeof participationOrDate.toMillis !== "function") {
    return toMillis(participationOrDate.participation_date);
  }
  return toMillis(participationOrDate);
}

function isParticipationInRolling30Days(participationOrDate, now = Date.now()) {
  const participationAt = participationMillis(participationOrDate);
  const nowMs = toMillis(now);
  return participationAt !== null && nowMs !== null &&
    participationAt >= nowMs - ROLLING_30_DAYS_MS && participationAt <= nowMs;
}

function parisDayKey(value) {
  const millis = toMillis(value);
  if (millis === null) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(millis));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function merchantIdentity(game) {
  const ref = game?.enseigne_id ?? game?.enseigne_ref ?? game?.merchantRef;
  if (ref && typeof ref.path === "string" && /^enseignes\/[^/]+$/.test(ref.path)) return ref.path;
  if (ref && typeof ref.id === "string" && ref.id.trim()) return `enseignes/${ref.id.trim()}`;
  for (const candidate of [game?.merchantId, game?.merchant_id]) {
    if (typeof candidate === "string" && candidate.trim()) return `enseignes/${candidate.trim()}`;
  }
  return null;
}

function hasLaunchEvidence(game) {
  const uniquePlayers = finiteNumber(game?.unique_players_count);
  if (uniquePlayers !== null) return uniquePlayers >= 10;
  return (finiteNumber(game?.participations) ?? 0) >= 20;
}

/** Mirrors the existing Admin/Flutter publication truth table, without activating it. */
function gamePublicationState(game) {
  const status = normalizedStatus(game?.status);
  if (game?.deleted === true || CLOSED_STATUSES.has(status)) return "disabled";
  if (game?.visible_public === false && game?.visible_public_auto_published === true) return "hidden";
  if (game?.visible_public !== false && !DRAFT_STATUSES.has(status)) return "published";
  return hasLaunchEvidence(game) ? "published_inconsistent" : "draft";
}

function gameDateMillis(game, first, second) {
  return toMillis(game?.[first]) ?? toMillis(game?.[second]);
}

/**
 * Returns a conservative access result. `qrAccessState: "ready"` must come
 * from the privileged secure-QR proof check, never from a game document.
 */
function gameInProgress(game, { now = Date.now(), qrAccessState } = {}) {
  const nowMs = toMillis(now);
  if (nowMs === null) return { state: "indeterminate", reason: "invalid_now" };
  const publication = gamePublicationState(game);
  if (publication === "disabled" || publication === "hidden" || publication === "draft") {
    return { state: "not_playable", reason: publication };
  }
  const startMs = gameDateMillis(game, "start_date", "startDate");
  const endMs = gameDateMillis(game, "end_date", "endDate");
  if (startMs === null || endMs === null) return { state: "indeterminate", reason: "missing_dates" };
  if (startMs > nowMs) return { state: "not_playable", reason: "not_started" };
  if (endMs <= nowMs) return { state: "not_playable", reason: "ended" };
  if (ENDED_STATUSES.has(normalizedStatus(game?.status))) {
    return { state: "indeterminate", reason: "ended_status_conflicts_with_dates" };
  }
  const qrOnly = game?.access_mode === "qr_only";
  const privateFlag = qrOnly || game?.isPrivate === true || ["prive", "privé", "private"].includes(normalizedStatus(game?.status));
  if (!privateFlag) return { state: "playable", reason: "public" };
  if (!qrOnly) return { state: "indeterminate", reason: "private_access_not_proven" };
  if (qrAccessState === "ready") return { state: "playable", reason: "qr_access_ready" };
  if (qrAccessState === "missing" || qrAccessState === "regeneration-required" || qrAccessState === "ended") {
    return { state: "not_playable", reason: `qr_${qrAccessState}` };
  }
  return { state: "indeterminate", reason: "qr_access_not_checked" };
}

module.exports = {
  DAY_MS,
  ROLLING_30_DAYS_MS,
  toMillis,
  isEligibleRegisteredPlayer,
  isParticipationInRolling30Days,
  parisDayKey,
  merchantIdentity,
  gamePublicationState,
  gameInProgress,
};
