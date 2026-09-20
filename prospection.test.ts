import assert from "node:assert/strict";
import test from "node:test";
import { duplicateOf, enrichMissing, identityKeys, parseFields, parseSearch } from "./lib/prospection/model";
import { parseQualification, qualifyProspect } from "./lib/prospection/qualification";
import { distanceKm, GooglePlacesProvider } from "./lib/prospection/provider";

test("saisie minimale, statuts, emails, URLs et coordonnées validés", () => {
  assert.equal(parseFields({ name: "Commerce" }).status, "new");
  for (const fields of [{ name: "" }, { name: "A", status: "constructor" }, { name: "A", email: "bad" }, { name: "A", website: "javascript:alert(1)" }, { name: "A", latitude: 100 }, { name: "A", next_follow_up_at: "hier" }]) assert.throws(() => parseFields(fields));
});
test("normalisation des identités et détection des champs historiques", () => {
  const keys = identityKeys({ name: "Café Étoile", address: "1, rue du Port", city: "Dunkerque", phone: "03 28 00 00 00", website: "https://www.example.fr/a", email: "TEST@example.fr" });
  const other = identityKeys({ name: "cafe etoile", address: "1 rue du port", city: "Dunkerque", phone_number: "+33 3 28 00 00 00", site_web_url: "example.fr/b", email: "test@example.fr" });
  assert.deepEqual(keys, other);
  assert.equal(duplicateOf({ name: "A" }, [{ id: "1", kind: "prospect", data: { name: "A" } }]), null, "Un nom seul ne suffit pas");
  for (const fields of [{ google_place_id: "place1" }, { email: "a@test.fr" }, { phone: "0328000000" }, { website: "https://example.fr" }, { name: "A", address: "1 rue X", city: "Dunkerque" }]) assert.ok(duplicateOf(fields, [{ id: "1", kind: "prospect", data: fields }]));
  assert.equal(duplicateOf({ email: "a@test.fr" }, [{ id: "1", kind: "prospect", data: { email: "a@test.fr" } }, { id: "2", kind: "client", data: { email: "a@test.fr" } }])?.kind, "client");
});
test("qualification JSON stricte : valides acceptés, malformés et scores injustifiés refusés", () => {
  const valid = { summary: null, relevance: null, reasons: [], suggested_angle: null, suggested_message: null };
  assert.deepEqual(parseQualification(JSON.stringify(valid)), valid);
  for (const invalid of ["```json\n{}\n```", {}, [], { ...valid, extra: true }, { ...valid, relevance: "80" }, { ...valid, relevance: 101 }, { ...valid, relevance: 10 }, { ...valid, reasons: [1] }, { ...valid, summary: {} }]) assert.throws(() => parseQualification(invalid));
});
test("enrichissement limité aux champs manquants avec provenance", () => {
  const current = parseFields({ name: "Mon nom", phone: "0328000000", notes: "Note privée" });
  const enriched = enrichMissing(current, parseFields({ name: "Google name", phone: "different", website: "https://test.fr", source_url: "https://maps.google.com/test", fetched_at: "2026-09-20T10:00:00Z" }));
  assert.equal(enriched.name, "Mon nom"); assert.equal(enriched.phone, "0328000000"); assert.equal(enriched.notes, "Note privée"); assert.equal(enriched.website, "https://test.fr/"); assert.ok(enriched.fetched_at); assert.ok(enriched.source_url);
});
test("qualification limite les données transmises et n’invente pas de score", async () => {
  const fields = parseFields({ name: "Boutique A", contact_email: "private@test.fr", notes: "Confidentiel" });
  const draft = await qualifyProspect(fields); assert.equal(draft.relevance, null); assert.ok(draft.suggested_message?.includes("Boutique A"));
  await qualifyProspect(fields, { name: "test", async qualify(input) { assert.deepEqual(Object.keys(input).sort(), ["category", "city", "name", "website"]); return draft; } });
  await assert.rejects(qualifyProspect(fields, { name: "invalid", async qualify() { return {}; } }));
});
test("recherche bornée et rayon réellement appliqué par le provider", async () => {
  assert.throws(() => parseSearch({ location: "Dunkerque", radius: 0, limit: 20, categories: ["bars"] }));
  assert.throws(() => parseSearch({ location: "Dunkerque", radius: 15, limit: 61, categories: ["bars"] }));
  assert.ok(distanceKm({ latitude: 51, longitude: 2 }, { latitude: 49, longitude: 2 }) > 200);
  let calls = 0;
  const fetcher: typeof fetch = async (_url, options) => {
    assert.equal((options?.headers as Record<string, string>)["X-Goog-Api-Key"], "server-key");
    calls++;
    return Response.json(calls === 1 ? { places: [{ location: { latitude: 51, longitude: 2 } }] } : { places: [
      { id: "near", displayName: { text: "Proche" }, location: { latitude: 51, longitude: 2 }, addressComponents: [{ longText: "Dunkerque", types: ["locality"] }] },
      { id: "far", displayName: { text: "Loin" }, location: { latitude: 49, longitude: 2 } },
    ] });
  };
  const results = await new GooglePlacesProvider("server-key", fetcher).search({ location: "Dunkerque", radius: 15, limit: 20, categories: ["restaurants"] });
  assert.equal(results.length, 1); assert.equal(results[0].google_place_id, "near"); assert.equal(results[0].city, "Dunkerque"); assert.ok(results[0].fetched_at);
  await assert.rejects(new GooglePlacesProvider("").getDetails("place"), /configurer/);
});

// Discovery V1.1: provider calls are mocked, never billed.
import { googleRatingLabel, importableIndices, resultState, type SearchResult } from "./lib/prospection/model";
import { SEARCH_FIELDS, DETAIL_FIELDS, searchCallBudget } from "./lib/prospection/provider";
const center = { latitude: 51, longitude: 2 };
const place = (id: number) => ({ id: "p" + id, displayName: { text: "Place " + id }, location: center, rating: 4.6, userRatingCount: 327 });
for (const limit of [20, 50, 100]) test("discovery " + limit + ": pagination, ceiling and early stop", async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body)); bodies.push(body);
    const call = bodies.length;
    if (call === 1) return Response.json({ places: [{ location: center }] });
    assert.equal((options?.headers as Record<string, string>)["X-Goog-FieldMask"], SEARCH_FIELDS);
    return Response.json({ places: Array.from({ length: 20 }, (_, i) => place((call - 2) * 20 + i)), nextPageToken: "page" + call });
  };
  const results = await new GooglePlacesProvider("secret", fetcher).search({ location: "Dunkerque", radius: 15, categories: ["restaurants"], limit });
  assert.equal(results.length, limit); assert.equal(new Set(results.map(p => p.google_place_id)).size, limit);
  assert.equal(bodies.length, 1 + Math.ceil(limit / 20));
  assert.equal(results[0].google_rating, 4.6); assert.equal(results[0].google_user_rating_count, 327);
  if (limit > 20) { assert.equal(bodies[2].pageToken, "page2"); const { pageToken: token, ...rest } = bodies[2]; assert.ok(token); assert.deepEqual(rest, bodies[1]); }
  if (limit === 100) { assert.equal(bodies[4].pageToken, undefined); assert.notDeepEqual(bodies[4].locationBias, bodies[1].locationBias); }
});
test("overlapping pages deduplicate by Place ID, filter original radius and stop at 50", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++; if (calls === 1) return Response.json({ places: [{ location: center }] });
    return Response.json({ places: [...Array.from({ length: 20 }, (_, i) => place((calls - 2) * 15 + i)), { ...place(999), location: { latitude: 49, longitude: 2 } }], nextPageToken: "t" + calls });
  };
  const results = await new GooglePlacesProvider("secret", fetcher).search({ location: "Dunkerque", radius: 15, categories: ["restaurants"], limit: 50 });
  assert.equal(results.length, 50); assert.equal(calls, 4); assert.ok(!results.some(p => p.google_place_id === "p999"));
});
for (const limit of [20, 50, 100]) test("hard budget with endless unique tokens: " + limit, async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json(calls === 1 ? { places: [{ location: center }] } : { places: [place(0)], nextPageToken: "t" + calls }); };
  const results = await new GooglePlacesProvider("secret", fetcher).search({ location: "Dunkerque", radius: 15, categories: ["restaurants", "bars", "commerces"], limit });
  assert.equal(calls, 1 + searchCallBudget(limit)); assert.equal(results.length, 1);
});
test("repeated token stops pagination; missing token and empty results terminate", async () => {
  for (const nextPageToken of ["same", undefined]) {
    let calls = 0;
    const fetcher: typeof fetch = async () => { calls++; return Response.json(calls === 1 ? { places: [{ location: center }] } : { places: [], nextPageToken }); };
    assert.deepEqual(await new GooglePlacesProvider("secret", fetcher).search({ location: "Dunkerque", radius: 15, categories: ["restaurants"], limit: 50 }), []);
    assert.equal(calls, nextPageToken ? 3 : 2);
  }
});
test("Google metrics validate absence, zero and invalid values without inventing", async () => {
  assert.equal(parseFields({ name: "Absent" }).google_rating, null);
  assert.equal(googleRatingLabel(parseFields({ name: "Absent" })), "");
  assert.equal(googleRatingLabel(parseFields({ name: "Rated", google_rating: 4.6, google_user_rating_count: 327 })), "★ 4,6 · 327 avis");
  assert.equal(googleRatingLabel(parseFields({ name: "Zero", google_user_rating_count: 0 })), "0 avis");
  for (const google_rating of [-1, 6, "4.6", NaN]) assert.throws(() => parseFields({ name: "Bad", google_rating }));
  for (const google_user_rating_count of [-1, 1.5, "327"]) assert.throws(() => parseFields({ name: "Bad", google_user_rating_count }));
  const detail = await new GooglePlacesProvider("secret", async () => Response.json({ id: "x", displayName: { text: "No rating" } })).getDetails("x");
  assert.equal(detail.google_rating, null); assert.equal(detail.google_user_rating_count, null);
  assert.equal(enrichMissing({ phone: "manual", google_rating: 3 }, parseFields({ name: "G", phone: "google", google_rating: 4.6 })).google_rating, 3);
  assert.ok(!SEARCH_FIELDS.includes("reviews")); assert.ok(!DETAIL_FIELDS.includes("reviews")); assert.ok(!SEARCH_FIELDS.includes("primaryTypeDisplayName"));
});
test("deterministic states and select all exclude client, prospect and ignored", () => {
  const data = parseFields({ name: "Same", google_place_id: "same" });
  const entries = (["ignored", "prospect", "client"] as const).map(kind => ({ id: kind, kind, data }));
  assert.equal(duplicateOf(data, entries)?.kind, "client");
  assert.equal(duplicateOf(data, entries.slice(0, 2))?.kind, "prospect");
  assert.equal(duplicateOf(data, entries.slice(0, 1))?.kind, "ignored");
  assert.equal(duplicateOf(parseFields({ name: "Same", google_place_id: "other" }), entries.slice(0, 1)), null);
  const results: SearchResult[] = [{ ...data, duplicate: null }, ...entries.map(entry => ({ ...data, duplicate: duplicateOf(data, [entry]) }))];
  assert.deepEqual(results.map(resultState), ["new", "ignored", "prospect", "client"]);
  assert.deepEqual(importableIndices(results), [0]);
});

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";
test("client dependency graph cannot import the Google provider or its secret", () => {
  const visited = new Set<string>();
  function visit(file: string) {
    if (visited.has(file)) return; visited.add(file);
    const source = readFileSync(file, "utf8");
    assert.ok(!/GOOGLE_PLACES_API_KEY|places\.googleapis\.com|X-Goog-Api-Key/.test(source), file);
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const statement of ast.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.importClause?.isTypeOnly) continue;
      const binding = statement.importClause?.namedBindings;
      if (!statement.importClause?.name && binding && ts.isNamedImports(binding) && binding.elements.every(item => item.isTypeOnly)) continue;
      const name = statement.moduleSpecifier.text;
      if (!name.startsWith(".") && !name.startsWith("@/")) continue;
      const base = name.startsWith("@/") ? resolve(name.slice(2)) : resolve(dirname(file), name);
      const target = [base + ".ts", base + ".tsx", base + "/index.ts", base + "/index.tsx"].find(existsSync);
      if (target) visit(target);
    }
  }
  visit(resolve("app/admin/prospection/page.tsx"));
  visit(resolve("app/admin/prospection/[id]/page.tsx"));
  assert.ok(visited.size > 3);
  assert.ok(![...visited].some(file => /prospection[\\/](provider|server)\.ts$/.test(file)));
});
