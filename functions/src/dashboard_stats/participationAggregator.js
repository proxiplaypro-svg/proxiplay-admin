/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Inactive preparation for Dashboard participation statistics.
 *
 * This file exports no Cloud Function and is deliberately not imported by
 * functions/index.js. A future trigger must provide a stable source version,
 * player eligibility and an HMAC-derived player hash before calling it.
 */
const crypto = require("node:crypto");
const { parisDayKey, toMillis } = require("./gameContract");

const CONTRIBUTIONS = "analytics_contributions";
const DAILY = "analytics_daily";
const PLAYER_ACTIVITY = "analytics_player_activity";
const EXPIRATIONS = "analytics_expirations";

function playerHashFromUid(uid, secret) {
  if (typeof uid !== "string" || !uid.trim()) throw new Error("A player UID is required.");
  if (typeof secret !== "string" || secret.length < 32) throw new Error("A dedicated HMAC secret is required.");
  return crypto.createHmac("sha256", secret).update(uid).digest("hex");
}

function sourceIdFromPath(participantPath) {
  if (typeof participantPath !== "string" || !/^games\/[^/]+\/participants\/[^/]+$/.test(participantPath)) {
    throw new Error("A participant document path is required.");
  }
  return crypto.createHash("sha256").update(participantPath).digest("hex");
}

function userIdFromParticipant(data) {
  const value = data?.user_id;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value.id === "string" && value.id.trim()) return value.id.trim();
  return null;
}

function validSourceId(sourceId) {
  return typeof sourceId === "string" && /^[A-Za-z0-9_-]+$/.test(sourceId);
}

function validHash(playerHash) {
  return typeof playerHash === "string" && /^[a-f0-9]{64}$/.test(playerHash);
}

function normaliseDesiredContribution({ participant, playerHash, isEligiblePlayer }) {
  if (!participant) return { active: false, reason: "deleted" };
  const participationAtMs = toMillis(participant.participation_date);
  const dayKey = parisDayKey(participant.participation_date);
  if (participationAtMs === null || !dayKey) return { active: false, reason: "invalid_participation_date" };
  if (!userIdFromParticipant(participant)) return { active: false, reason: "missing_player" };
  if (isEligiblePlayer !== true) return { active: false, reason: "ineligible_player" };
  if (!validHash(playerHash)) return { active: false, reason: "missing_protected_player_hash" };
  return { active: true, playerHash, dayKey, participationAtMs };
}

function contributionPath(sourceId) {
  return `${CONTRIBUTIONS}/${sourceId}`;
}

function dailyPath(dayKey) {
  return `${DAILY}/${dayKey}`;
}

function dailyPlayerPath(dayKey, playerHash) {
  return `${dailyPath(dayKey)}/players/${playerHash}`;
}

function activityPath(playerHash) {
  return `${PLAYER_ACTIVITY}/${playerHash}`;
}

function activityDayPath(playerHash, dayKey) {
  return `${activityPath(playerHash)}/days/${dayKey}`;
}
function playerContributionPath(playerHash, sourceId) { return `${PLAYER_ACTIVITY}/${playerHash}/contributions/${sourceId}`; }
function expirationPath(participationAtMs, sourceId) { return `${EXPIRATIONS}/${String(participationAtMs).padStart(16, "0")}_${sourceId}`; }

function snapshotData(snapshot) {
  return snapshot?.exists ? snapshot.data() : null;
}

function integer(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function sameContribution(left, right) {
  return left.active === right.active && left.playerHash === right.playerHash &&
    left.dayKey === right.dayKey && left.participationAtMs === right.participationAtMs;
}

function contributionFromStored(data) {
  if (!data?.active) return { active: false, reason: data?.reason ?? "inactive" };
  if (!validHash(data.player_hash) || typeof data.day_key !== "string" || !Number.isFinite(data.participation_at_ms)) {
    return { active: false, reason: "stored_contribution_invalid" };
  }
  return {
    active: true,
    playerHash: data.player_hash,
    dayKey: data.day_key,
    participationAtMs: data.participation_at_ms,
  };
}

function contributionDocument(desired, sourceVersion, processedAtMs) {
  return desired.active
    ? {
      active: true, player_hash: desired.playerHash, day_key: desired.dayKey,
      participation_at_ms: desired.participationAtMs, source_version: sourceVersion,
      processed_at_ms: processedAtMs, expiration_at_ms: desired.participationAtMs + 30 * 86400000,
    }
    : { active: false, reason: desired.reason, source_version: sourceVersion, processed_at_ms: processedAtMs };
}

function addDelta(map, key, delta) {
  map.set(key, (map.get(key) ?? 0) + delta);
}

/**
 * Atomically projects one current participant-document state. Retries are safe
 * because the contribution document stores the newest observed source version.
 * `sourceVersion` must be the Firestore document update time supplied by a
 * future trigger; processing time is never used as its replacement.
 */
async function applyParticipationEvent({
  db, sourceId, sourceVersion, participant = null, playerHash = null,
  isEligiblePlayer = false, processedAtMs = Date.now(),
}) {
  if (!db?.runTransaction || !db?.doc) throw new Error("A Firestore-compatible db is required.");
  if (!validSourceId(sourceId)) throw new Error("sourceId must be a stable Firestore-safe identifier.");
  if (!Number.isFinite(sourceVersion)) throw new Error("A numeric sourceVersion is required.");
  const desired = normaliseDesiredContribution({ participant, playerHash, isEligiblePlayer });
  const sourceRef = db.doc(contributionPath(sourceId));

  return db.runTransaction(async (tx) => {
    const storedData = snapshotData(await tx.get(sourceRef));
    const storedVersion = storedData?.source_version;
    if (typeof storedVersion === "number" && storedVersion > sourceVersion) return { applied: false, reason: "stale_event" };
    const previous = contributionFromStored(storedData);
    if (storedVersion === sourceVersion && sameContribution(previous, desired)) return { applied: false, reason: "duplicate_event" };
    if (storedVersion === sourceVersion && storedData) throw new Error("Conflicting events share a sourceVersion.");

    const dailyDelta = new Map();
    const playerDayDelta = new Map();
    if (previous.active) {
      addDelta(dailyDelta, previous.dayKey, -1);
      addDelta(playerDayDelta, `${previous.dayKey}/${previous.playerHash}`, -1);
    }
    if (desired.active) {
      addDelta(dailyDelta, desired.dayKey, 1);
      addDelta(playerDayDelta, `${desired.dayKey}/${desired.playerHash}`, 1);
    }

    const reads = new Map();
    for (const dayKey of dailyDelta.keys()) reads.set(dailyPath(dayKey), db.doc(dailyPath(dayKey)));
    for (const key of playerDayDelta.keys()) {
      const [dayKey, hash] = key.split("/");
      reads.set(dailyPlayerPath(dayKey, hash), db.doc(dailyPlayerPath(dayKey, hash)));
      reads.set(activityPath(hash), db.doc(activityPath(hash)));
      reads.set(activityDayPath(hash, dayKey), db.doc(activityDayPath(hash, dayKey)));
    }
    const snapshots = new Map(await Promise.all([...reads].map(async ([path, ref]) => [path, await tx.get(ref)])));

    const uniqueDeltaByDay = new Map();
    const activityChanges = new Map();
    for (const [key, delta] of playerDayDelta) {
      if (delta === 0) continue;
      const [dayKey, hash] = key.split("/");
      const markerRef = dailyPlayerPath(dayKey, hash);
      const markerCount = integer(snapshotData(snapshots.get(markerRef))?.participations_count);
      const nextMarkerCount = Math.max(0, markerCount + delta);
      if (markerCount === 0 && nextMarkerCount > 0) addDelta(uniqueDeltaByDay, dayKey, 1);
      if (markerCount > 0 && nextMarkerCount === 0) addDelta(uniqueDeltaByDay, dayKey, -1);
      if (nextMarkerCount === 0) tx.delete(db.doc(markerRef));
      else tx.set(db.doc(markerRef), { participations_count: nextMarkerCount, updated_at_ms: processedAtMs });

      const activityDayRef = activityDayPath(hash, dayKey);
      const activityDayCount = integer(snapshotData(snapshots.get(activityDayRef))?.participations_count);
      const nextActivityDayCount = Math.max(0, activityDayCount + delta);
      if (nextActivityDayCount === 0) tx.delete(db.doc(activityDayRef));
      else tx.set(db.doc(activityDayRef), { participations_count: nextActivityDayCount, updated_at_ms: processedAtMs });
      const item = activityChanges.get(hash) ?? { added: [], removed: [] };
      (delta > 0 ? item.added : item.removed).push({ dayKey, participationAtMs: desired.active ? desired.participationAtMs : previous.participationAtMs });
      activityChanges.set(hash, item);
    }

    for (const [dayKey, delta] of dailyDelta) {
      if (delta === 0) continue;
      const current = snapshotData(snapshots.get(dailyPath(dayKey))) ?? {};
      tx.set(db.doc(dailyPath(dayKey)), {
        participations_count: Math.max(0, integer(current.participations_count) + delta),
        unique_players_count: Math.max(0, integer(current.unique_players_count) + (uniqueDeltaByDay.get(dayKey) ?? 0)),
        updated_at_ms: processedAtMs,
      });
    }

    for (const [hash, change] of activityChanges) {
      const current = snapshotData(snapshots.get(activityPath(hash))) ?? {};
      const activeDays = integer(current.active_days_count);
      let activeDaysDelta = 0;
      for (const { dayKey } of [...change.added, ...change.removed]) {
        const marker = snapshotData(snapshots.get(dailyPlayerPath(dayKey, hash)));
        const before = integer(marker?.participations_count);
        const movement = playerDayDelta.get(`${dayKey}/${hash}`) ?? 0;
        const after = Math.max(0, before + movement);
        if (before === 0 && after > 0) activeDaysDelta += 1;
        if (before > 0 && after === 0) activeDaysDelta -= 1;
      }
      const addedLatest = change.added.reduce((latest, item) => Math.max(latest, item.participationAtMs), -Infinity);
      const previousLatest = Number.isFinite(current.last_played_at_ms) ? current.last_played_at_ms : null;
      const removedLatest = change.removed.some((item) => item.participationAtMs === previousLatest);
      const next = {
        active_days_count: Math.max(0, activeDays + activeDaysDelta),
        updated_at_ms: processedAtMs,
      };
      if (addedLatest > (previousLatest ?? -Infinity)) {
        next.last_played_at_ms = addedLatest;
        next.needs_reconciliation = false;
      } else if (removedLatest) {
        // Exact recovery is a targeted future query of this player's day docs,
        // never a collection-wide participation scan.
        next.last_played_at_ms = null;
        next.needs_reconciliation = true;
      } else {
        next.last_played_at_ms = previousLatest;
        next.needs_reconciliation = current.needs_reconciliation === true;
      }
      tx.set(db.doc(activityPath(hash)), next);
    }

    if (previous.active) {
      tx.delete(db.doc(playerContributionPath(previous.playerHash, sourceId)));
      tx.delete(db.doc(expirationPath(previous.participationAtMs, sourceId)));
    }
    if (desired.active) {
      tx.set(db.doc(playerContributionPath(desired.playerHash, sourceId)), { participation_at_ms: desired.participationAtMs, source_id: sourceId, updated_at_ms: processedAtMs });
      tx.set(db.doc(expirationPath(desired.participationAtMs, sourceId)), { source_id: sourceId, player_hash: desired.playerHash, participation_at_ms: desired.participationAtMs, expiration_at_ms: desired.participationAtMs + 30 * 86400000 });
    }
    tx.set(sourceRef, contributionDocument(desired, sourceVersion, processedAtMs));
    return { applied: true, active: desired.active, reason: desired.reason ?? null };
  });
}

module.exports = {
  CONTRIBUTIONS, DAILY, PLAYER_ACTIVITY, EXPIRATIONS,
  playerHashFromUid, sourceIdFromPath, userIdFromParticipant, normaliseDesiredContribution,
  contributionPath, dailyPath, dailyPlayerPath, activityPath, activityDayPath, playerContributionPath, expirationPath,
  applyParticipationEvent,
};
