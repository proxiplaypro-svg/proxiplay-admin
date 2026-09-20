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
