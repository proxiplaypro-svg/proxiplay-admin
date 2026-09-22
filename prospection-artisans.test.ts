import assert from "node:assert/strict";
import test from "node:test";
import { GooglePlacesProvider, type SearchMetrics } from "./lib/prospection/provider";
import { ARTISAN_QUERIES, businessCallBudget, queriesForSector } from "./lib/prospection/searchConfig";
const center = { latitude: 51.03, longitude: 2.37 };
const input = (limit = 50) => ({ location: "Dunkerque", radius: 15, categories: ["artisans B2C"], limit });
const place = (id: string, extra = {}) => ({ id, displayName: { text: id }, location: center, ...extra });
for (const limit of [20, 50]) test(`artisans ${limit}: explicit trades, diversity, global limit and early stop`, async () => {
  const queries: string[] = []; let calls = 0; let metrics: SearchMetrics | undefined;
  const fetcher: typeof fetch = async (_url, options) => {
    calls++; const body = JSON.parse(String(options?.body));
    if (body.pageSize === 1) return Response.json({ places: [{ location: center }] });
    queries.push(body.textQuery); assert.notEqual(body.textQuery, "artisans B2C");
    return Response.json({ places: Array.from({ length: body.pageSize }, (_, i) => place(`${queries.length}-${i}`)), nextPageToken: "next" });
  };
  const results = await new GooglePlacesProvider("test-secret", fetcher).search(input(limit), undefined, m => { metrics = m; });
  assert.equal(results.length, limit); assert.equal(new Set(results.map(p => p.subcategory)).size, limit === 20 ? 4 : 5);
  assert.equal(calls, limit === 20 ? 5 : 6); assert.ok(calls <= 1 + businessCallBudget(limit, input().categories));
  assert.deepEqual(queries, ARTISAN_QUERIES.slice(0, queries.length)); assert.equal(metrics?.returned, limit);
});
for (const limit of [20, 50]) test(`artisans ${limit}: strict budget when every result is already known`, async () => {
  let calls = 0; let metrics: SearchMetrics | undefined;
  const provider = new GooglePlacesProvider("test-secret", async (_url, options) => {
    calls++; const body = JSON.parse(String(options?.body));
    return Response.json(body.pageSize === 1 ? { places: [{ location: center }] } : { places: [place(`p${calls}`)], nextPageToken: `token${calls}` });
  });
  assert.deepEqual(await provider.search(input(limit), () => false, m => { metrics = m; }), []);
  assert.equal(calls, limit === 20 ? 7 : 9); assert.equal(metrics?.excludedKnown, calls - 1); assert.equal(metrics?.budgetReached, true);
});
for (const [name, a, b] of [
  ["Place ID", { id: "same" }, { id: "same" }],
  ["telephone", { nationalPhoneNumber: "03 28 00 00 00" }, { nationalPhoneNumber: "+33 3 28 00 00 00" }],
  ["domain", { websiteUri: "https://www.artisan.fr/contact" }, { websiteUri: "http://artisan.fr/" }],
  ["normalized name and address", { displayName: { text: "Artisan Étoile" }, formattedAddress: "1, rue X" }, { displayName: { text: "ARTISAN ETOILE" }, formattedAddress: "1 rue X" }],
] as const) test(`multi-query deduplication: ${name}`, async () => {
  let calls = 0;
  const results = await new GooglePlacesProvider("test-secret", async () => {
    calls++; return Response.json(calls === 1 ? { places: [{ location: center }] } : { places: calls === 2 ? [place("a", a)] : calls === 3 ? [place("b", b)] : [] });
  }).search(input());
  assert.equal(results.length, 1);
});
test("Google activity preserved; discovery trade survives parsing and import", async () => {
  let calls = 0;
  const results = await new GooglePlacesProvider("test-secret", async () => Response.json(++calls === 1 ? { places: [{ location: center }] } : { places: calls === 2 ? [place("a", { primaryTypeDisplayName: { text: "Plombier chauffagiste" } })] : [] })).search(input());
  assert.equal(results[0].category, "Plombier chauffagiste"); assert.equal(results[0].subcategory, "plombier");
});
test("empty and out-of-radius results remain empty; metrics distinguish the cause", async () => {
  for (const places of [[], [place("far", { location: { latitude: 48, longitude: 2 } })]]) {
    let calls = 0; let metrics: SearchMetrics | undefined;
    const results = await new GooglePlacesProvider("test-secret", async () => Response.json(++calls === 1 ? { places: [{ location: center }] } : { places })).search(input(), undefined, m => { metrics = m; });
    assert.deepEqual(results, []); assert.equal(calls, 9); assert.equal(metrics?.excludedKnown, 0); assert.equal(metrics?.outOfRadius, places.length * 8);
  }
});
test("combined sectors retain the same global artisan budget", async () => {
  let calls = 0;
  const results = await new GooglePlacesProvider("test-secret", async () => Response.json(++calls === 1 ? { places: [{ location: center }] } : { places: [], nextPageToken: "t" + calls })).search({ ...input(), categories: ["restaurants", "artisans B2C", "services locaux"] });
  assert.equal(calls, 9); assert.deepEqual(results, []);
  assert.deepEqual(queriesForSector("restaurants"), ["restaurants"]); assert.deepEqual(queriesForSector("habitat"), ["magasin aménagement maison"]);
});
