/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { CACHE_TTL_MS, buildActiveCatalog } = require("../src/public_content/activeCatalog");

const timestamp = (iso) => ({ toDate: () => new Date(iso) });
const game = (id, data) => ({ id, data: () => data });
const now = new Date("2026-10-30T15:00:00.000Z");

test("active catalog only exposes its public whitelist and groups merchants", () => {
  const catalog = buildActiveCatalog({
    now,
    activeGameDocs: [
      game("late", { name: "Jeu B", enseigne_name: "Boutique A", end_date: timestamp("2026-11-02T12:00:00Z"), email: "private@example.test", description: "Not public" }),
      game("early", { title: "Jeu A", merchantName: "Boutique A", endDate: timestamp("2026-11-01T12:00:00Z"), access_mode: "qr_only", restrictedToAdults: true, phone: "private" }),
      game("other", { title: "Jeu C", merchantName: "Boutique B", end_date: timestamp("2026-11-03T12:00:00Z") }),
    ],
  });
  assert.equal(catalog.activeGamesCount, 3);
  assert.equal(catalog.activeMerchantsCount, 2);
  assert.deepEqual(catalog.games.map((item) => item.id), ["early", "late", "other"]);
  assert.deepEqual(catalog.games[0], { id: "early", title: "Jeu A", merchantName: "Boutique A", endsAt: new Date("2026-11-01T12:00:00Z"), accessMode: "qr_only", restrictedToAdults: true });
  assert.equal(Object.hasOwn(catalog.games[1], "description"), false);
  assert.equal(Object.hasOwn(catalog.games[1], "email"), false);
  assert.deepEqual(catalog.merchants, [{ name: "Boutique A", activeGamesCount: 2 }, { name: "Boutique B", activeGamesCount: 1 }]);
  assert.equal(catalog.validUntil.getTime(), now.getTime() + CACHE_TTL_MS);
});

test("active catalog refuses an incomplete active-game record before publication", () => {
  assert.throws(
    () => buildActiveCatalog({ now, activeGameDocs: [game("bad", { title: "Sans date", merchantName: "Boutique" })] }),
    /no valid end date/,
  );
});

test("catalog expires when its first listed game ends", () => {
  const catalog = buildActiveCatalog({
    now,
    activeGameDocs: [game("soon", { title: "Fin proche", merchantName: "Boutique", end_date: timestamp("2026-10-30T16:00:00Z") })],
  });
  assert.equal(catalog.validUntil.toISOString(), "2026-10-30T16:00:00.000Z");
});
