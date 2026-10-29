/* eslint-disable @typescript-eslint/no-require-imports */
// Daily dashboard backfill: logic only (no Firebase initialisation), so that it
// can be tested with an in-memory Firestore. The CLI is
// scripts/backfill-dashboard-daily.js.
const { parisDayKey, isEligibleRegisteredPlayer } = require("../../src/dashboard_stats/gameContract");

const PAGE_SIZE = 500;

function shiftDay(day, amount) { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - amount); return date.toISOString().slice(0, 10); }
function playerId(value) { return typeof value === "string" ? value : value?.id; }
function isTimestamp(value) { return value && typeof value.toMillis === "function"; }

async function eligibleUsers(db, ids, cache) {
  const missing = [...ids].filter((id) => !cache.has(id));
  for (let index = 0; index < missing.length; index += 500) {
    const refs = missing.slice(index, index + 500).map((id) => db.doc(`users/${id}`));
    const snapshots = await db.getAll(...refs);
    snapshots.forEach((snapshot, offset) => cache.set(missing[index + offset], snapshot.exists && isEligibleRegisteredPlayer(snapshot.data())));
  }
}

// Same rule as the nightly consolidation: participations of eligible registered
// players during the Paris calendar day.
async function recomputeDay({ db, documentId, day, users, pageSize = PAGE_SIZE }) {
  // A conservative UTC envelope handles both Paris DST transitions. Results
  // are filtered again with parisDayKey, so overlap never double-counts.
  const start = new Date(`${day}T00:00:00Z`); start.setUTCHours(start.getUTCHours() - 2);
  const end = new Date(`${shiftDay(day, -1)}T00:00:00Z`); end.setUTCHours(end.getUTCHours() + 2);
  let cursor = null; let scanned = 0; const players = new Set(); let participations = 0;
  for (;;) {
    let query = db.collectionGroup("participants").where("participation_date", ">=", start).where("participation_date", "<", end).orderBy("participation_date").orderBy(documentId).limit(pageSize);
    if (cursor) query = query.startAfter(cursor.get("participation_date"), cursor.ref);
    const page = await query.get(); scanned += page.size;
    const ids = new Set(page.docs.map((item) => playerId(item.get("user_id"))).filter(Boolean));
    await eligibleUsers(db, ids, users);
    for (const item of page.docs) {
      const date = item.get("participation_date"); const id = playerId(item.get("user_id"));
      if (!isTimestamp(date) || parisDayKey(date) !== day || !id || users.get(id) !== true) continue;
      participations += 1; players.add(id);
    }
    if (page.size < pageSize) break;
    cursor = page.docs.at(-1);
  }
  return { day, participations_count: participations, unique_players_count: players.size, scanned };
}

/**
 * What to do with analytics_daily/{day} given what is already stored:
 * - "write": nothing stored yet;
 * - "unchanged": same counts, no write (re-running is a no-op);
 * - "keep_consolidation": written by the nightly consolidation, the reference
 *   for its day: never replaced by this script;
 * - "keep_newer": updated after this run started;
 * - "differs_kept": different counts, kept unless --replace is given;
 * - "replace": different counts and --replace given (previous values kept for audit).
 */
function planDay(existing, result, { replace = false, runStartedAt }) {
  if (!existing) return "write";
  if (existing.participations_count === result.participations_count && existing.unique_players_count === result.unique_players_count) return "unchanged";
  if (existing.source === "daily_consolidation") return "keep_consolidation";
  const updated = existing.updated_at?.toMillis?.() ?? 0;
  if (updated > runStartedAt) return "keep_newer";
  return replace ? "replace" : "differs_kept";
}

async function storeDay({ db, result, replace = false, runStartedAt }) {
  const ref = db.doc(`analytics_daily/${result.day}`);
  // Decided again inside the transaction: a consolidation may write meanwhile.
  return db.runTransaction(async (tx) => {
    const previous = await tx.get(ref); const existing = previous.exists ? previous.data() : null;
    const action = planDay(existing, result, { replace, runStartedAt });
    if (action !== "write" && action !== "replace") return action;
    tx.set(ref, {
      participations_count: result.participations_count, unique_players_count: result.unique_players_count,
      updated_at: new Date(runStartedAt), source: "dashboard_daily_backfill",
      ...(action === "replace" ? { replaced: { participations_count: existing.participations_count ?? null, unique_players_count: existing.unique_players_count ?? null, source: existing.source ?? null, replaced_at: new Date(runStartedAt) } } : {}),
    }, { merge: true });
    return action;
  });
}

async function runBackfill({ db, documentId, days = 30, write = false, replace = false, runStartedAt = Date.now() }) {
  const reference = shiftDay(parisDayKey(runStartedAt), 1); // last closed Paris day
  const users = new Map(); const results = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const result = await recomputeDay({ db, documentId, day: shiftDay(reference, offset), users });
    const stored = await db.doc(`analytics_daily/${result.day}`).get();
    const existing = stored.exists ? stored.data() : null;
    const planned = planDay(existing, result, { replace, runStartedAt });
    const action = write ? await storeDay({ db, result, replace, runStartedAt }) : planned;
    results.push({ ...result, action, stored: existing ? { participations_count: existing.participations_count ?? null, unique_players_count: existing.unique_players_count ?? null, source: existing.source ?? null } : null });
  }
  const reads = results.reduce((sum, item) => sum + item.scanned, 0) + users.size + results.length * (write ? 2 : 1);
  return { dry_run: !write, replace, reference_date: reference, days: results, reads };
}

module.exports = { recomputeDay, planDay, storeDay, runBackfill, shiftDay };
