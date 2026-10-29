/* eslint-disable @typescript-eslint/no-require-imports */
// Usage: node scripts/backfill-dashboard-daily.js --project proxi-play-odzp2e [--write]
// Default is dry-run. The script only ever writes analytics_daily/{YYYY-MM-DD}.
const admin = require("firebase-admin");
const { parisDayKey, isEligibleRegisteredPlayer } = require("../src/dashboard_stats/gameContract");

const PAGE_SIZE = 500;
const DAYS = 30;
const write = process.argv.includes("--write");
const projectIndex = process.argv.indexOf("--project");
const projectId = projectIndex >= 0 ? process.argv[projectIndex + 1] : undefined;
if (!projectId) throw new Error("Pass --project <project-id>.");
if (!admin.apps.length) admin.initializeApp({ projectId });
const db = admin.firestore();
const runStartedAt = Date.now();

function shiftDay(day, amount) { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - amount); return date.toISOString().slice(0, 10); }
function playerId(value) { return typeof value === "string" ? value : value?.id; }
function isTimestamp(value) { return value && typeof value.toMillis === "function"; }

async function eligibleUsers(ids, cache) {
  const missing = [...ids].filter((id) => !cache.has(id));
  for (let index = 0; index < missing.length; index += 500) {
    const refs = missing.slice(index, index + 500).map((id) => db.doc(`users/${id}`));
    const snapshots = await db.getAll(...refs);
    snapshots.forEach((snapshot, offset) => cache.set(missing[index + offset], snapshot.exists && isEligibleRegisteredPlayer(snapshot.data())));
  }
}

async function recomputeDay(day, users) {
  // A conservative UTC envelope handles both Paris DST transitions. Results
  // are filtered again with parisDayKey, so overlap never double-counts.
  const start = new Date(`${day}T00:00:00Z`); start.setUTCHours(start.getUTCHours() - 2);
  const end = new Date(`${shiftDay(day, -1)}T00:00:00Z`); end.setUTCHours(end.getUTCHours() + 2);
  let cursor = null; let scanned = 0; const players = new Set(); let participations = 0;
  for (;;) {
    let query = db.collectionGroup("participants").where("participation_date", ">=", start).where("participation_date", "<", end).orderBy("participation_date").orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor.get("participation_date"), cursor.ref);
    const page = await query.get(); scanned += page.size;
    const ids = new Set(page.docs.map((item) => playerId(item.get("user_id"))).filter(Boolean));
    await eligibleUsers(ids, users);
    for (const item of page.docs) {
      const date = item.get("participation_date"); const id = playerId(item.get("user_id"));
      if (!isTimestamp(date) || parisDayKey(date) !== day || !id || users.get(id) !== true) continue;
      participations += 1; players.add(id);
    }
    if (page.size < PAGE_SIZE) break;
    cursor = page.docs.at(-1);
  }
  return { day, participations_count: participations, unique_players_count: players.size, scanned };
}

async function storeDay(result) {
  const ref = db.doc(`analytics_daily/${result.day}`);
  await db.runTransaction(async (tx) => {
    const previous = await tx.get(ref); const updated = previous.data()?.updated_at?.toMillis?.() ?? 0;
    if (updated > runStartedAt) return; // never overwrite a newer consolidation
    tx.set(ref, { participations_count: result.participations_count, unique_players_count: result.unique_players_count, updated_at: new Date(runStartedAt), source: "dashboard_daily_backfill" }, { merge: true });
  });
}

(async () => {
  const reference = shiftDay(parisDayKey(runStartedAt), 1);
  const users = new Map(); const results = [];
  for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
    const result = await recomputeDay(shiftDay(reference, offset), users);
    results.push(result); if (write) await storeDay(result);
  }
  console.log(JSON.stringify({ dry_run: !write, reference_date: reference, days: results, reads_estimate: results.reduce((sum, item) => sum + item.scanned, 0) + users.size }, null, 2));
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
