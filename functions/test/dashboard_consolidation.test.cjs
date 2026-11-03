/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { consolidateFromFirestore, consolidateTemporalMetrics, parisMidnightMillis } = require("../src/dashboard_stats/consolidation");

// Minimal in-memory Firestore: enough for the paginated reads and the writes of
// consolidateFromFirestore, without any emulator or production access.
const millis = (value) => typeof value?.toMillis === "function" ? value.toMillis() : +value;
// Same surface as a Firestore Timestamp for the fields the code reads.
const timestamp = (iso) => ({ toMillis: () => Date.parse(iso), toDate: () => new Date(iso) });

function fakeDb(collections) {
  const writes = {};
  function query(docs) {
    let items = docs; let size = Infinity;
    const api = {
      where(field, op, value) { items = items.filter((item) => op !== ">=" || millis(item.data()[field]) >= millis(value)); return api; },
      orderBy() { return api; },
      limit(value) { size = value; return api; },
      startAfter(cursor) { items = items.slice(items.indexOf(cursor) + 1); return api; },
      async get() { const page = items.slice(0, size); return { docs: page, size: page.length }; },
    };
    return api;
  }
  const doc = (id, data) => ({ id, data: () => data });
  return {
    writes,
    collection: (name) => query((collections[name] || []).map(([id, data]) => doc(id, data))),
    collectionGroup: (name) => query((collections[name] || []).map(([id, data]) => doc(id, data))),
    doc: (path) => ({
      async get() { return { exists: false, data: () => undefined }; },
      async set(data) { writes[path] = { ...(writes[path] || {}), ...data }; },
    }),
    async getAll(...refs) { return refs.map(() => ({ exists: false, data: () => undefined })); },
  };
}

test("consolidation writes schema 2 with source_complete (regression: 'complete is not defined')", async () => {
  const now = Date.parse("2026-10-29T08:00:00Z");
  const yesterday = timestamp("2026-10-28T10:00:00Z");
  const db = fakeDb({
    users: [["u1", { user_role: "joueur" }], ["u2", { user_role: "joueur" }]],
    participants: [["p1", { user_id: "u1", participation_date: yesterday }], ["p2", { user_id: "u1", participation_date: yesterday }]],
    games: [],
  });
  const result = await consolidateFromFirestore({ db, now });
  assert.equal(result.complete, true);
  const current = db.writes["dashboard_stats/current"];
  assert.equal(current.schema_version, 2);
  assert.equal(current.source_complete, true);
  assert.equal(current.reference_date, "2026-10-28");
  assert.equal(current.registered_players, 2);
  assert.equal(current.active_players_j30, 1, "the same player is counted once across two participations");
  assert.equal(current.participations_j30, 2);
  assert.equal(current.players_yesterday, 1);
  assert.equal(current.participations_yesterday, 2);
  assert.deepEqual(db.writes["analytics_daily/2026-10-28"].participations_count, 2);
});

test("a source over the read budget is reported incomplete, never as a partial number", async () => {
  const now = Date.parse("2026-10-29T08:00:00Z");
  const users = Array.from({ length: 3 }, (_, i) => [`u${i}`, { user_role: "joueur" }]);
  const db = fakeDb({ users, participants: [], games: [] });
  const result = await consolidateFromFirestore({ db, now, maximum: 2, pageSize: 2 });
  assert.equal(result.complete, false);
  assert.equal(db.writes["dashboard_stats/current"].source_complete, false);
  assert.equal(db.writes["dashboard_stats/current"].registered_players, null);
  assert.equal(db.writes["dashboard_stats/current"].active_players_j30, null);
  assert.equal(db.writes["dashboard_stats/current"].participations_j30, 0);
});

test("participations have their own, larger read budget", async () => {
  const now = Date.parse("2026-10-29T08:00:00Z");
  const participants = Array.from({ length: 5 }, (_, i) => [`p${i}`, { user_id: "u1", participation_date: timestamp("2026-10-28T10:00:00Z") }]);
  const db = fakeDb({ users: [["u1", { user_role: "joueur" }]], participants, games: [] });
  const result = await consolidateFromFirestore({ db, now, maximum: 2, participantsMaximum: 10, pageSize: 2 });
  assert.equal(result.complete, true, "5 participations fit the participations budget even above `maximum`");
  assert.equal(db.writes["dashboard_stats/current"].participations_yesterday, 5);
  assert.equal(db.writes["dashboard_stats/current"].active_players_j30, 1);
  assert.equal(db.writes["dashboard_stats/current"].participations_j30, 5);
});

test("J30 values are unavailable when the participant read budget is reached", async () => {
  const now = Date.parse("2026-10-29T08:00:00Z");
  const participants = Array.from({ length: 3 }, (_, i) => [`p${i}`, { user_id: "u1", participation_date: timestamp("2026-10-28T10:00:00Z") }]);
  const db = fakeDb({ users: [["u1", { user_role: "joueur" }]], participants, games: [] });
  const result = await consolidateFromFirestore({ db, now, participantsMaximum: 2, pageSize: 2 });
  assert.equal(result.complete, false);
  assert.equal(db.writes["dashboard_stats/current"].active_players_j30, null);
  assert.equal(db.writes["dashboard_stats/current"].participations_j30, null);
});

test("J30 includes only eligible players and deduplicates participant references", async () => {
  const now = Date.parse("2026-10-29T08:00:00Z");
  const date = timestamp("2026-10-28T10:00:00Z");
  const db = fakeDb({
    users: [
      ["eligible", { user_role: "joueur" }],
      ["test", { user_role: "joueur", is_test_account: true }],
      ["deleted", { user_role: "joueur", is_deleted: true }],
    ],
    participants: [
      ["one", { user_id: { id: "eligible" }, participation_date: date }],
      ["two", { user_id: "eligible", participation_date: date }],
      ["three", { user_id: "test", participation_date: date }],
      ["four", { user_id: "deleted", participation_date: date }],
      ["five", { user_id: "missing", participation_date: date }],
    ],
    games: [],
  });
  await consolidateFromFirestore({ db, now });
  const current = db.writes["dashboard_stats/current"];
  assert.equal(current.active_players_j30, 1);
  assert.equal(current.participations_j30, 2);
});

test("J30 query starts at Paris midnight across the daylight-saving boundary", async () => {
  const now = Date.parse("2026-03-31T01:10:00Z"); // 03:10 in Paris, reference day is 30 March.
  assert.equal(new Date(parisMidnightMillis("2026-03-01")).toISOString(), "2026-02-28T23:00:00.000Z");
  const db = fakeDb({
    users: [["u1", { user_role: "joueur" }]],
    participants: [
      ["inside-start-day", { user_id: "u1", participation_date: timestamp("2026-02-28T23:30:00Z") }],
      ["before-window", { user_id: "u1", participation_date: timestamp("2026-02-28T22:30:00Z") }],
      ["inside-end-day", { user_id: "u1", participation_date: timestamp("2026-03-30T21:30:00Z") }],
    ],
    games: [],
  });
  await consolidateFromFirestore({ db, now });
  const current = db.writes["dashboard_stats/current"];
  assert.equal(current.reference_date, "2026-03-30");
  assert.equal(current.active_players_j30, 1);
  assert.equal(current.participations_j30, 2);
});

test("legacy temporal aggregation cannot reset authoritative J30 fields", async () => {
  const db = fakeDb({});
  await consolidateTemporalMetrics({ db, now: Date.parse("2026-10-29T08:00:00Z") });
  const current = db.writes["dashboard_stats/current"];
  assert.equal(Object.hasOwn(current, "active_players_j30"), false);
  assert.equal(Object.hasOwn(current, "participations_j30"), false);
});
