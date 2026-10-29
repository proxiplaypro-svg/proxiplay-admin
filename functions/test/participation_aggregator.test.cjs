/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyParticipationEvent,
  playerHashFromUid,
  contributionPath,
  dailyPath,
  dailyPlayerPath,
  activityPath,
} = require("../src/dashboard_stats/participationAggregator");

class MemoryFirestore {
  constructor() { this.docs = new Map(); this.writes = []; this.tail = Promise.resolve(); this.failNextCommit = false; }
  doc(path) { return path; }
  async runTransaction(callback) {
    const run = this.tail.then(async () => {
      const staged = new Map(this.docs);
      const writes = [];
      const tx = {
        get: async (path) => ({ exists: staged.has(path), data: () => staged.get(path) }),
        set: (path, data) => { staged.set(path, { ...data }); writes.push(path); },
        delete: (path) => { staged.delete(path); writes.push(path); },
      };
      const result = await callback(tx);
      if (this.failNextCommit) { this.failNextCommit = false; throw new Error("simulated commit failure"); }
      this.docs = staged;
      this.writes.push(...writes);
      return result;
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
  data(path) { return this.docs.get(path); }
}

const secret = "a".repeat(32);
const hash = (uid) => playerHashFromUid(uid, secret);
const DAY = 86_400_000;
const base = Date.parse("2026-10-20T12:00:00.000Z");
const participant = (uid, at = base) => ({ user_id: { id: uid }, participation_date: { toMillis: () => at } });
const apply = (db, sourceId, version, data, options = {}) => applyParticipationEvent({
  db, sourceId, sourceVersion: version, participant: data, playerHash: options.playerHash ?? (data ? hash(data.user_id.id) : null),
  isEligiblePlayer: options.isEligiblePlayer ?? true, processedAtMs: 123,
});

function dayKey(at) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(at));
  const read = (type) => parts.find((part) => part.type === type).value;
  return `${read("year")}-${read("month")}-${read("day")}`;
}

test("first participation creates one contribution, day and unique-player marker", async () => {
  const db = new MemoryFirestore();
  await apply(db, "gameA_playerA", 1, participant("playerA"));
  const day = dayKey(base);
  assert.deepEqual(db.data(dailyPath(day)), { participations_count: 1, unique_players_count: 1, updated_at_ms: 123 });
  assert.equal(db.data(dailyPlayerPath(day, hash("playerA"))).participations_count, 1);
  assert.equal(db.data(contributionPath("gameA_playerA")).active, true);
});

test("same player, same day contributes several plays but one daily player", async () => {
  const db = new MemoryFirestore();
  await apply(db, "a", 1, participant("playerA"));
  await apply(db, "b", 1, participant("playerA", base + 1));
  const result = db.data(dailyPath(dayKey(base)));
  assert.equal(result.participations_count, 2);
  assert.equal(result.unique_players_count, 1);
});

test("identical retry and stale out-of-order event never double-count", async () => {
  const db = new MemoryFirestore();
  await apply(db, "a", 2, participant("playerA"));
  assert.equal((await apply(db, "a", 2, participant("playerA"))).reason, "duplicate_event");
  assert.equal((await apply(db, "a", 1, null)).reason, "stale_event");
  assert.equal(db.data(dailyPath(dayKey(base))).participations_count, 1);
});

test("concurrent first participations are serialised without lost or duplicate increments", async () => {
  const db = new MemoryFirestore();
  await Promise.all([apply(db, "a", 1, participant("playerA")), apply(db, "b", 1, participant("playerB"))]);
  assert.deepEqual(db.data(dailyPath(dayKey(base))), { participations_count: 2, unique_players_count: 2, updated_at_ms: 123 });
});

test("deletion and repeated deletion cannot make counts negative", async () => {
  const db = new MemoryFirestore();
  await apply(db, "a", 1, participant("playerA"));
  await apply(db, "a", 2, null);
  await apply(db, "a", 3, null);
  assert.deepEqual(db.data(dailyPath(dayKey(base))), { participations_count: 0, unique_players_count: 0, updated_at_ms: 123 });
});

test("date correction moves the contribution and unique player between Paris days", async () => {
  const db = new MemoryFirestore();
  await apply(db, "a", 1, participant("playerA", base));
  await apply(db, "a", 2, participant("playerA", base + DAY));
  assert.equal(db.data(dailyPath(dayKey(base))).participations_count, 0);
  assert.equal(db.data(dailyPath(dayKey(base + DAY))).participations_count, 1);
});

test("player correction, invalidation and revalidation reconcile daily counts", async () => {
  const db = new MemoryFirestore();
  await apply(db, "a", 1, participant("playerA"));
  await apply(db, "a", 2, participant("playerB"));
  await apply(db, "a", 3, participant("playerB"), { isEligiblePlayer: false });
  await apply(db, "a", 4, participant("playerB"));
  const data = db.data(dailyPath(dayKey(base)));
  assert.deepEqual(data, { participations_count: 1, unique_players_count: 1, updated_at_ms: 123 });
  assert.equal(db.data(contributionPath("a")).player_hash, hash("playerB"));
});

test("Paris midnight and both DST transitions use the participation date, including late arrival", async () => {
  const db = new MemoryFirestore();
  const dates = [Date.parse("2026-03-28T23:30:00Z"), Date.parse("2026-03-29T00:30:00Z"), Date.parse("2026-10-25T01:30:00Z")];
  await apply(db, "a", 1, participant("playerA", dates[0]));
  await apply(db, "b", 1, participant("playerB", dates[1]));
  await apply(db, "c", 1, participant("playerC", dates[2]));
  assert.equal(db.data(dailyPath("2026-03-29")).participations_count, 2);
  assert.equal(db.data(dailyPath("2026-10-25")).participations_count, 1);
});

test("missing or invalid dates are recorded inactive and never counted", async () => {
  const db = new MemoryFirestore();
  await apply(db, "missing", 1, { user_id: { id: "playerA" } });
  await apply(db, "invalid", 1, { user_id: { id: "playerA" }, participation_date: new Date("invalid") });
  assert.equal(db.data(contributionPath("missing")).reason, "invalid_participation_date");
  assert.equal([...db.docs.keys()].filter((path) => path.startsWith("analytics_daily/")).length, 0);
});

test("a failed commit leaves no partial write and a later retry is coherent", async () => {
  const db = new MemoryFirestore();
  db.failNextCommit = true;
  await assert.rejects(apply(db, "a", 1, participant("playerA")), /simulated/);
  assert.equal(db.docs.size, 0);
  await apply(db, "a", 1, participant("playerA"));
  assert.equal(db.data(dailyPath(dayKey(base))).participations_count, 1);
});

test("statistics documents contain no UID and writes stay in the approved collections", async () => {
  const db = new MemoryFirestore();
  await apply(db, "a", 1, participant("player-secret"));
  for (const [path, value] of db.docs) {
    assert.match(path, /^(analytics_contributions|analytics_daily|analytics_player_activity|analytics_expirations)\//);
    assert.doesNotMatch(JSON.stringify(value), /player-secret/);
  }
  assert.ok(db.data(activityPath(hash("player-secret"))));
});
