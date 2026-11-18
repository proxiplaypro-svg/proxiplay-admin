/* eslint-disable @typescript-eslint/no-require-imports */
// A winner is a prizes document (main prize or instant win). The
// games/{gameId}/instant_winners documents are the instant-win slots planned
// when a game is generated (hasWinner: false); a real instant win only
// updates one of them and creates a prizes document. Counting them as
// winners inflated admin_stats/global.winners_count (5,618 = 2,145 prizes +
// 3,473 slots on 18/11/2026) and the merchant counters.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// In-memory Firestore, just enough for the two recount paths. Any read of an
// instant_winners collection is recorded so the tests can prove it never
// happens.
const reads = [];
const writes = [];
const state = {
  games: [],
  prizes: [],
  instantWinners: 0,
  participants: 0,
};

function countQuery(name, value) {
  return { count: () => ({ get: async () => { reads.push(name); return { data: () => ({ count: value() }) }; } }) };
}

function gameRef(id) {
  return {
    id,
    path: `games/${id}`,
    collection(name) {
      return {
        get: async () => {
          reads.push(`games/${id}/${name}`);
          if (name === "participants") return { size: 0, forEach: () => {} };
          if (name === "instant_winners") return { size: state.instantWinners, forEach: () => {} };
          throw new Error(`unexpected subcollection ${name}`);
        },
      };
    },
  };
}

const db = {
  collection(name) {
    if (name === "games") {
      return {
        get: async () => ({ size: state.games.length, docs: state.games.map((id) => ({ id, ref: gameRef(id), data: () => ({}) })) }),
        where: () => ({
          get: async () => {
            const docs = state.games.map((id) => ({ id, ref: gameRef(id), data: () => ({}) }));
            return { empty: docs.length === 0, size: docs.length, docs };
          },
        }),
      };
    }
    if (name === "prizes") {
      return {
        ...countQuery("prizes.count", () => state.prizes.length),
        where: (field, op, refs) => ({
          get: async () => {
            reads.push("prizes.where");
            const ids = new Set(refs.map((ref) => ref.id));
            return { size: state.prizes.filter((prize) => ids.has(prize.gameId)).length };
          },
        }),
      };
    }
    if (name === "users") {
      return { ...countQuery("users.count", () => 0), where: () => countQuery("players.count", () => 0) };
    }
    if (name === "enseignes") return countQuery("enseignes.count", () => 0);
    if (name === "admin_stats") {
      return { doc: () => ({ set: async (data) => { writes.push({ path: "admin_stats/global", data }); } }) };
    }
    throw new Error(`unexpected collection ${name}`);
  },
  collectionGroup(name) {
    if (name === "instant_winners") return countQuery("instant_winners.count", () => state.instantWinners);
    if (name === "participants") return countQuery("participants.count", () => state.participants);
    throw new Error(`unexpected collection group ${name}`);
  },
  doc(docPath) {
    return { set: async (data) => { writes.push({ path: docPath, data }); } };
  },
};

const firestore = () => db;
firestore.FieldValue = {
  serverTimestamp: () => "serverTimestamp",
  increment: (value) => ({ increment: value }),
  delete: () => "delete",
};
const fakeAdmin = { firestore };

// Replace firebase-admin before the modules under test load it.
const adminPath = require.resolve("firebase-admin", { paths: [path.join(__dirname, "..")] });
require.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true, exports: fakeAdmin };

const { computeMerchantStats } = require("../src/merchant_stats");
const { rebuildAdminStats } = require("../src/admin_stats/rebuild");

function reset({ games, prizes, instantWinners }) {
  reads.length = 0;
  writes.length = 0;
  state.games = games;
  state.prizes = prizes;
  state.instantWinners = instantWinners;
}

test("merchant recount: winners are prizes only, planned instant-win slots are ignored", async () => {
  // One game, 50 planned instant-win slots, 3 real wins (1 main + 2 instant).
  reset({
    games: ["game-1"],
    prizes: [{ gameId: "game-1" }, { gameId: "game-1" }, { gameId: "game-1" }],
    instantWinners: 50,
  });

  const stats = await computeMerchantStats({ path: "enseignes/shop-1" });

  assert.equal(stats.winners_count, 3);
  assert.equal(reads.some((read) => read.endsWith("/instant_winners")), false,
    "instant_winners must not even be read by the merchant recount");
});

test("merchant recount: a freshly generated game has no winner yet", async () => {
  reset({ games: ["game-new"], prizes: [], instantWinners: 50 });

  const stats = await computeMerchantStats({ path: "enseignes/shop-1" });

  assert.equal(stats.winners_count, 0);
});

test("global rebuild: winners_count equals the prizes count", async () => {
  // Production on 18/11/2026: 2,145 prizes and 3,473 instant_winners slots.
  reset({
    games: [],
    prizes: Array.from({ length: 2145 }, () => ({ gameId: "any" })),
    instantWinners: 3473,
  });

  const stats = await rebuildAdminStats();

  assert.equal(stats.winnersCount, 2145);
  assert.equal(reads.includes("instant_winners.count"), false,
    "the rebuild must not count instant_winners");
  const written = writes.find((write) => write.path === "admin_stats/global");
  assert.equal(written.data.winners_count, 2145);
});

test("no trigger counts instant_winners creations as winners", () => {
  const root = path.join(__dirname, "..");
  const index = fs.readFileSync(path.join(root, "index.js"), "utf8");
  const triggers = fs.readFileSync(path.join(root, "src/admin_stats/triggers.js"), "utf8");

  assert.doesNotMatch(index, /exports\.onInstantWinnerCreated\b/);
  assert.doesNotMatch(index, /exports\.onAdminStatsInstantWinnerCreated\b/);
  assert.doesNotMatch(index + triggers, /onDocumentCreated\(\s*["'`]games\/\{gameId\}\/instant_winners/);
});
