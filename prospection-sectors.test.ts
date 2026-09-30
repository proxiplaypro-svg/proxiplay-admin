import assert from "node:assert/strict";
import test from "node:test";
import { SECTORS, normalize } from "./lib/prospection/model";
import { SECTOR_SEARCH, queriesForSector, businessCallBudget } from "./lib/prospection/searchConfig";
import { GooglePlacesProvider, type SearchMetrics } from "./lib/prospection/provider";
const center = { latitude: 51.03, longitude: 2.37 };
const place = (id: string, extra = {}) => ({ id, displayName: { text: id }, location: center, ...extra });

test("every UI category has one explicit strategy; specialized trades are not repeated in commerces", () => {
  assert.deepEqual(Object.keys(SECTOR_SEARCH).sort(), [...SECTORS].sort());
  assert.deepEqual(queriesForSector("Commerces"), SECTOR_SEARCH.commerces.queries);
  assert.deepEqual(queriesForSector("Bars / cafés"), SECTOR_SEARCH["bars/cafés"].queries);
  assert.deepEqual(queriesForSector("artisans_b2c"), SECTOR_SEARCH["artisans B2C"].queries);
  for (const [sector, config] of Object.entries(SECTOR_SEARCH)) {
    assert.ok(config.queries.length > 0);
    assert.equal(config.mode === "multi", config.queries.length > 1);
    if (config.mode === "multi") assert.ok(!config.queries.includes(sector));
  }
  const specialized = Object.entries(SECTOR_SEARCH).filter(([key]) => key !== "commerces").flatMap(([,config]) => [...config.queries]);
  assert.ok(SECTOR_SEARCH.commerces.queries.every(query => !specialized.includes(query)));
  for (const query of ["magasin de meubles", "magasin de décoration", "magasin électroménager"]) assert.ok(SECTOR_SEARCH.habitat.queries.includes(query));
  assert.ok(SECTOR_SEARCH.sport.queries.includes("magasin de sport"));
  assert.throws(() => queriesForSector("catégorie inventée"));
});

for (const sector of SECTORS) for (const limit of [20, 50]) test(`${sector}: global ${limit}, diversity, bounded calls and early stop`, async () => {
  const queries: string[] = []; let metrics: SearchMetrics | undefined;
  const provider = new GooglePlacesProvider("mock", async (_url, options) => {
    const b = JSON.parse(String(options?.body));
    if (b.pageSize === 1) return Response.json({ places: [{ location: center }] });
    assert.ok(queriesForSector(sector).includes(b.textQuery));
    queries.push(b.textQuery);
    return Response.json({ places: Array.from({ length: b.pageSize }, (_, i) => place(`${queries.length}-${i}`)), nextPageToken: `token${queries.length}` });
  });
  const results = await provider.search({ location: "Dunkerque", radius: 15, limit, categories: [sector] }, undefined, m => { metrics = m; });
  assert.equal(results.length, limit); assert.ok(queries.length <= businessCallBudget(limit, [sector]));
  assert.equal(metrics?.googleCalls, queries.length + 1);
  if (SECTOR_SEARCH[sector].mode === "multi") {
    assert.ok(new Set(queries).size > 1); assert.notEqual(queries[0], queries[1]);
    assert.ok(new Set(results.map(r => r.subcategory)).size > 1);
    const trades = [...new Set(results.map(r => r.subcategory))];
    assert.deepEqual(results.slice(0, trades.length).map(r => r.subcategory), trades, "first visible results alternate trades");
    const counts = trades.map(trade => results.filter(r => r.subcategory === trade).length);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= (limit === 20 ? 5 : 10), "one small page maximum separates trades");
  }
  assert.ok(queries.length < businessCallBudget(limit, [sector]) || limit === 20);
});

for (const limit of [20, 50]) test(`commerces exhausted/excluded: maximum ${limit === 20 ? 7 : 9} calls`, async () => {
  let calls = 0;
  const provider = new GooglePlacesProvider("mock", async (_url, options) => {
    calls++; const b = JSON.parse(String(options?.body));
    return Response.json(b.pageSize === 1 ? { places: [{ location: center }] } : { places: [place(`p${calls}`)], nextPageToken: "next" });
  });
  assert.deepEqual(await provider.search({ location: "Dunkerque", radius: 15, limit, categories: ["commerces"] }, () => false), []);
  assert.equal(calls, limit === 20 ? 7 : 9);
});

test("commerce merger deduplicates place, telephone, domain and normalized name/address across trades", async () => {
  const first = [place("same"), place("phone", { nationalPhoneNumber: "0328000000" }), place("domain", { websiteUri: "https://www.shop.fr/a" }), place("address", { displayName: { text: "Étoile" }, formattedAddress: "1, rue X" })];
  const second = [place("same"), place("phone-other", { nationalPhoneNumber: "+33 3 28 00 00 00" }), place("domain-other", { websiteUri: "http://shop.fr/b" }), place("address-other", { displayName: { text: "ETOILE" }, formattedAddress: "1 rue X" })];
  let calls = 0;
  const results = await new GooglePlacesProvider("mock", async () => Response.json(++calls === 1 ? { places: [{ location: center }] } : { places: calls === 2 ? first : calls === 3 ? second : [] })).search({ location: "Dunkerque", radius: 15, limit: 50, categories: ["commerces"] });
  assert.equal(results.length, 4); assert.equal(calls, 9);
});

test("later commerce trades become reachable when first trades are represented in persistent records", async () => {
  const known = Object.fromEntries(SECTOR_SEARCH.commerces.queries.slice(0, 8).map(q => [normalize(q), 10]));
  const queries: string[] = [];
  await new GooglePlacesProvider("mock", async (_url, options) => {
    const b = JSON.parse(String(options?.body)); if (b.pageSize === 1) return Response.json({ places: [{ location: center }] });
    queries.push(b.textQuery); return Response.json({ places: Array.from({ length: 10 }, (_, i) => place(`${queries.length}-${i}`)) });
  }).search({ location: "Dunkerque", radius: 15, limit: 50, categories: ["commerces"] }, undefined, undefined, known);
  assert.deepEqual(queries, SECTOR_SEARCH.commerces.queries.slice(8, 13));
});

test("selecting all categories still shares one budget and unknown sectors make zero Google calls", async () => {
  let calls = 0;
  const provider = new GooglePlacesProvider("mock", async () => Response.json(++calls === 1 ? { places: [{ location: center }] } : { places: [] }));
  await provider.search({ location: "Dunkerque", radius: 15, limit: 50, categories: SECTORS });
  assert.equal(calls, 9); calls = 0;
  await assert.rejects(provider.search({ location: "Dunkerque", radius: 15, limit: 50, categories: ["inconnu"] })); assert.equal(calls, 0);
});
