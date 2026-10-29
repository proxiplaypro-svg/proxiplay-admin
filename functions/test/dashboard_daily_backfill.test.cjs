/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { recomputeDay, planDay, runBackfill } = require("../scripts/lib/dashboardDailyBackfill");

const timestamp = (iso) => ({ toMillis: () => Date.parse(iso), toDate: () => new Date(iso) });
const millis = (value) => typeof value?.toMillis === "function" ? value.toMillis() : +value;
const DOCUMENT_ID = Symbol("documentId");

// In-memory Firestore: participants collection group (range, order, cursor),
// users via getAll, analytics_daily via get/set and transactions. Counts reads.
function fakeDb({ participants = [], users = {}, daily = {} }) {
  const store = { ...daily }; const stats = { reads: 0, writes: 0 };
  const participantDocs = participants.map(([id, data]) => ({ id, ref: { path: `games/g/participants/${id}` }, data: () => data, get: (field) => data[field] }));
  const snapshot = (path) => ({ exists: path in store, data: () => store[path] });
  function query() {
    const filters = []; let size = Infinity; let after = null;
    const api = {
      where(field, op, value) { filters.push([field, op, value]); return api; },
      orderBy() { return api; }, limit(value) { size = value; return api; },
      startAfter(_date, ref) { after = ref; return api; },
      async get() {
        let items = participantDocs.filter((doc) => filters.every(([field, op, value]) => op === ">=" ? millis(doc.get(field)) >= millis(value) : millis(doc.get(field)) < millis(value)))
          .sort((a, b) => millis(a.get("participation_date")) - millis(b.get("participation_date")) || a.id.localeCompare(b.id));
        if (after) items = items.slice(items.findIndex((doc) => doc.ref === after) + 1);
        items = items.slice(0, size); stats.reads += Math.max(1, items.length);
        return { docs: items, size: items.length };
      },
    };
    return api;
  }
  return {
    stats, store,
    collectionGroup: () => query(),
    doc: (path) => ({ path, async get() { stats.reads += 1; return snapshot(path); } }),
    async getAll(...refs) { stats.reads += refs.length; return refs.map((ref) => { const id = ref.path.split("/")[1]; return { exists: id in users, data: () => users[id] }; }); },
    async runTransaction(work) {
      return work({
        async get(ref) { stats.reads += 1; return snapshot(ref.path); },
        set(ref, data) { stats.writes += 1; store[ref.path] = { ...(store[ref.path] || {}), ...data }; },
      });
    },
  };
}

const player = { user_role: "joueur" };
const users = { a: player, b: player, merchant: { user_role: "commercant" }, tester: { ...player, is_test_account: true }, gone: { ...player, is_deleted: true } };

test("counts real participations of eligible players during the Paris day, DST day included", async () => {
  // 25/10/2026 in Paris: 24/10 22:00Z to 25/10 23:00Z (25 hours).
  const participants = [
    ["in-first", { user_id: "a", participation_date: timestamp("2026-10-24T22:00:00Z") }],
    ["in-extra-hour", { user_id: "b", participation_date: timestamp("2026-10-25T22:30:00Z") }],
    ["in-again", { user_id: "a", participation_date: timestamp("2026-10-25T10:00:00Z") }],
    ["before", { user_id: "a", participation_date: timestamp("2026-10-24T21:59:59Z") }],
    ["after", { user_id: "a", participation_date: timestamp("2026-10-25T23:00:00Z") }],
    ["merchant", { user_id: "merchant", participation_date: timestamp("2026-10-25T10:00:00Z") }],
    ["tester", { user_id: "tester", participation_date: timestamp("2026-10-25T10:00:00Z") }],
    ["deleted", { user_id: "gone", participation_date: timestamp("2026-10-25T10:00:00Z") }],
    ["unknown", { user_id: "nobody", participation_date: timestamp("2026-10-25T10:00:00Z") }],
    ["ref-id", { user_id: { id: "b" }, participation_date: timestamp("2026-10-25T11:00:00Z") }],
  ];
  for (const pageSize of [500, 2]) {
    const db = fakeDb({ participants, users });
    const result = await recomputeDay({ db, documentId: DOCUMENT_ID, day: "2026-10-25", users: new Map(), pageSize });
    assert.equal(result.participations_count, 4, `pageSize ${pageSize}`);
    assert.equal(result.unique_players_count, 2, `pageSize ${pageSize}`);
  }
});

test("write rule: never a consolidated day, never a different value without --replace", () => {
  const result = { participations_count: 10, unique_players_count: 4 };
  const runStartedAt = Date.parse("2026-10-29T12:00:00Z");
  const old = { toMillis: () => runStartedAt - 1000 }; const newer = { toMillis: () => runStartedAt + 1000 };
  assert.equal(planDay(null, result, { runStartedAt }), "write");
  assert.equal(planDay({ ...result, source: "dashboard_daily_backfill", updated_at: old }, result, { runStartedAt }), "unchanged");
  assert.equal(planDay({ participations_count: 9, unique_players_count: 4, source: "daily_consolidation", updated_at: old }, result, { runStartedAt, replace: true }), "keep_consolidation");
  assert.equal(planDay({ participations_count: 9, unique_players_count: 4, source: "dashboard_daily_backfill", updated_at: newer }, result, { runStartedAt, replace: true }), "keep_newer");
  assert.equal(planDay({ participations_count: 9, unique_players_count: 4, source: "dashboard_daily_backfill", updated_at: old }, result, { runStartedAt }), "differs_kept");
  assert.equal(planDay({ participations_count: 9, unique_players_count: 4, source: "dashboard_daily_backfill", updated_at: old }, result, { runStartedAt, replace: true }), "replace");
});

test("dry run reads only; write fills missing days; a second run is a no-op", async () => {
  const runStartedAt = Date.parse("2026-10-29T12:00:00Z"); // last closed Paris day: 28/10
  const participants = [
    ["p1", { user_id: "a", participation_date: timestamp("2026-10-26T10:00:00Z") }],
    ["p2", { user_id: "a", participation_date: timestamp("2026-10-27T10:00:00Z") }],
    ["p3", { user_id: "b", participation_date: timestamp("2026-10-28T10:00:00Z") }],
  ];
  const daily = {
    // Validated by the nightly consolidation, with a different value: must stay.
    "analytics_daily/2026-10-28": { participations_count: 5, unique_players_count: 5, source: "daily_consolidation", updated_at: { toMillis: () => runStartedAt - 1000 } },
    // Earlier backfill with a different value: kept without --replace.
    "analytics_daily/2026-10-27": { participations_count: 7, unique_players_count: 7, source: "dashboard_daily_backfill", updated_at: { toMillis: () => runStartedAt - 86400000 } },
  };
  const db = fakeDb({ participants, users, daily });
  const dry = await runBackfill({ db, documentId: DOCUMENT_ID, days: 3, runStartedAt });
  assert.equal(db.stats.writes, 0, "dry run never writes");
  assert.deepEqual(dry.days.map((day) => [day.day, day.action]), [["2026-10-26", "write"], ["2026-10-27", "differs_kept"], ["2026-10-28", "keep_consolidation"]]);
  assert.ok(dry.reads > 0);

  const first = await runBackfill({ db, documentId: DOCUMENT_ID, days: 3, write: true, runStartedAt });
  assert.deepEqual(first.days.map((day) => day.action), ["write", "differs_kept", "keep_consolidation"]);
  assert.equal(db.stats.writes, 1);
  assert.deepEqual(db.store["analytics_daily/2026-10-26"].participations_count, 1);
  assert.equal(db.store["analytics_daily/2026-10-27"].participations_count, 7, "different backfill value kept");
  assert.equal(db.store["analytics_daily/2026-10-28"].participations_count, 5, "consolidated value kept");

  const second = await runBackfill({ db, documentId: DOCUMENT_ID, days: 3, write: true, runStartedAt: runStartedAt + 60000 });
  assert.deepEqual(second.days.map((day) => day.action), ["unchanged", "differs_kept", "keep_consolidation"]);
  assert.equal(db.stats.writes, 1, "re-running writes nothing more");
});

test("--replace keeps the previous values for audit, and never touches a consolidated day", async () => {
  const runStartedAt = Date.parse("2026-10-29T12:00:00Z");
  const participants = [["p", { user_id: "a", participation_date: timestamp("2026-10-27T10:00:00Z") }]];
  const daily = {
    "analytics_daily/2026-10-27": { participations_count: 7, unique_players_count: 7, source: "dashboard_daily_backfill", updated_at: { toMillis: () => runStartedAt - 86400000 } },
    "analytics_daily/2026-10-28": { participations_count: 5, unique_players_count: 5, source: "daily_consolidation", updated_at: { toMillis: () => runStartedAt - 1000 } },
  };
  const db = fakeDb({ participants, users, daily });
  const report = await runBackfill({ db, documentId: DOCUMENT_ID, days: 2, write: true, replace: true, runStartedAt });
  assert.deepEqual(report.days.map((day) => day.action), ["replace", "keep_consolidation"]);
  assert.equal(db.store["analytics_daily/2026-10-27"].participations_count, 1);
  assert.deepEqual({ ...db.store["analytics_daily/2026-10-27"].replaced, replaced_at: undefined }, { participations_count: 7, unique_players_count: 7, source: "dashboard_daily_backfill", replaced_at: undefined });
  assert.equal(db.store["analytics_daily/2026-10-28"].participations_count, 5);
});
