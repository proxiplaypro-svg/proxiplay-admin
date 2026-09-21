import assert from "node:assert/strict";
import test from "node:test";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (![process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST].every(host => host && /^(localhost|127\.0\.0\.1):\d+$/.test(host))) throw new Error("Tests réservés aux émulateurs locaux.");
process.env.ADMIN_EMAILS = "proxiplay.pro@gmail.com";
initializeApp({ projectId: "demo-prospection" });
const db = getFirestore();
let api: typeof import("./app/api/admin/prospection/route");
let adminToken: string; let userToken: string;
async function signup(email: string) {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "test-password-local", returnSecureToken: true }) });
  const body = await response.json(); assert.ok(body.idToken); return body.idToken as string;
}
function request(method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown, id?: string, token: string | null = adminToken) {
  return api[method](new Request(`http://localhost/api/admin/prospection${id ? `?id=${id}` : ""}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }));
}
async function create(fields: Record<string, unknown> = {}) {
  const response = await request("POST", { action: "create", fields: { name: "Entreprise", ...fields } }); assert.equal(response.status, 200, await response.clone().text()); return (await response.json()).created[0] as string;
}
test.before(async () => { api = await import("./app/api/admin/prospection/route"); adminToken = await signup("proxiplay.pro@gmail.com"); userToken = await signup("person@example.test"); });
test.beforeEach(async () => { for (const collection of ["prospects", "enseignes", "merchants", "prospection_internal"]) await db.recursiveDelete(db.collection(collection)); });
test.after(async () => { await db.terminate(); });

test("toutes les méthodes refusent les accès anonymes, non-admin et jetons invalides", async () => {
  for (const method of ["GET", "POST", "PATCH", "DELETE"] as const) {
    assert.equal((await request(method, method === "GET" ? undefined : {}, undefined, null)).status, 401);
    assert.equal((await request(method, method === "GET" ? undefined : {}, undefined, userToken)).status, 403);
    assert.equal((await request(method, method === "GET" ? undefined : {}, undefined, "invalid")).status, 401);
  }
  assert.equal((await request("GET")).status, 200);
});
test("création, modification, statut, suivi et historique avec contrôle de révision", async () => {
  const id = await create({ name: "Café", city: "Dunkerque" });
  const updated = await request("PATCH", { revision: 1, fields: { city: "Calais", status: "follow_up", next_follow_up_at: "2026-10-01T10:00:00Z" } }, id);
  assert.equal(updated.status, 200, await updated.clone().text());
  const detail = await (await request("GET", undefined, id)).json();
  assert.equal(detail.prospect.status, "follow_up"); assert.equal(detail.prospect.city, "Calais"); assert.equal(detail.history.length, 2); assert.ok(detail.history.every((e: { actor: string }) => e.actor));
  assert.equal((await request("PATCH", { revision: 1, fields: { city: "Stale" } }, id)).status, 409);
  assert.equal((await request("PATCH", { revision: 2, fields: { status: "invalid" } }, id)).status, 400);
});
test("doublons bloqués sur chaque identité et à la modification", async () => {
  const fields = { name: "Café du Port", address: "1 rue du Port", city: "Dunkerque", google_place_id: "place", email: "contact@test.fr", phone: "0328000000", website: "https://www.example.fr" };
  await create(fields);
  for (const match of [{ google_place_id: "place" }, { email: "CONTACT@test.fr" }, { phone: "+33 3 28 00 00 00" }, { website: "https://example.fr/autre" }, { name: "cafe du port", address: "1, rue du Port", city: "Dunkerque" }]) assert.equal((await request("POST", { action: "create", fields: { name: "Autre", ...match } })).status, 409);
  const other = await create({ name: "Autre" });
  assert.equal((await request("PATCH", { revision: 1, fields: { email: "contact@test.fr" } }, other)).status, 409);
});
test("enseignes et merchants historiques détectés sans écriture commerciale", async () => {
  for (const collection of ["enseignes", "merchants"]) {
    const data = { name: collection, phone_number: "0328000001", site_web_url: "https://client.fr" };
    await db.doc(`${collection}/client`).set(data);
    const response = await request("POST", { action: "create", fields: { name: "Autre", website: "https://client.fr/contact" } });
    assert.equal(response.status, 409); assert.match((await response.json()).error, /Déjà client/);
    assert.deepEqual((await db.doc(`${collection}/client`).get()).data(), data);
    await db.doc(`${collection}/client`).delete();
  }
});
test("import uniquement de la sélection et dédoublonnage interne et concurrent", async () => {
  const selection = [{ name: "A", google_place_id: "a" }, { name: "A bis", google_place_id: "a" }, { name: "B", google_place_id: "b" }];
  const [first, second] = await Promise.all([request("POST", { action: "import", selection }), request("POST", { action: "import", selection })]);
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  const results = [await first.json(), await second.json()];
  assert.equal(results.reduce((n, result) => n + result.created.length, 0), 2);
  assert.equal((await db.collection("prospects").get()).size, 2);
});
test("recherche : résultats annotés, aucune écriture avant import", async () => {
  await db.doc("enseignes/client-search").set({ name: "Client", google_place_id: "client-place" });
  const savedFetch = globalThis.fetch; const savedKey = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith("https://places.googleapis.com/")) return savedFetch(url, options);
    calls++;
    return Response.json(calls === 1 ? { places: [{ location: { latitude: 51, longitude: 2 } }] } : { places: [{ id: "client-place", displayName: { text: "Client" }, location: { latitude: 51, longitude: 2 } }, { id: "new-place", displayName: { text: "Nouveau" }, location: { latitude: 51, longitude: 2 } }] });
  };
  try {
    const response = await request("POST", { action: "search", location: "Dunkerque", radius: 15, categories: ["restaurants"], limit: 20 });
    assert.equal(response.status, 200);
    const { results } = await response.json();
    assert.equal(results[0].duplicate.kind, "client"); assert.equal(results[1].duplicate, null);
    assert.equal((await db.collection("prospects").get()).size, 0);
    const imported = await request("POST", { action: "import", selection: [results[1]] }); assert.equal(imported.status, 200);
    assert.equal((await db.collection("prospects").get()).size, 1);
  } finally { globalThis.fetch = savedFetch; if (savedKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = savedKey; }
});
test("conversion explicite : association requise, enseigne existante, aucune création automatique", async () => {
  const id = await create({ name: "Client futur", google_place_id: "convert" });
  assert.equal((await request("PATCH", { revision: 1, fields: { status: "client" } }, id)).status, 400);
  assert.equal((await request("PATCH", { revision: 1, fields: { status: "client", converted_enseigne_id: "absent" } }, id)).status, 400);
  await db.doc("enseignes/existing").set({ name: "Client futur", google_place_id: "convert" });
  assert.equal((await request("PATCH", { revision: 1, fields: { status: "client", converted_enseigne_id: "existing" } }, id)).status, 200);
  assert.equal((await db.collection("enseignes").get()).size, 1);
});
test("notes, appel déclaré, qualification et suppression complète de l’historique", async () => {
  const id = await create();
  assert.equal((await request("PATCH", { revision: 1, action: "note", note: "À rappeler" }, id)).status, 200);
  assert.equal((await request("PATCH", { revision: 2, action: "call" }, id)).status, 200);
  assert.equal((await request("PATCH", { revision: 3, action: "qualify" }, id)).status, 200);
  const data = (await db.doc(`prospects/${id}`).get()).data()!;
  assert.ok(data.last_contact_at); assert.equal(data.qualification.relevance, null);
  assert.equal((await request("DELETE", { revision: 1 }, id)).status, 409);
  assert.equal((await request("DELETE", { revision: 4 }, id)).status, 200);
  assert.equal((await db.doc(`prospects/${id}`).get()).exists, false);
  assert.equal((await db.collection(`prospects/${id}/history`).get()).size, 0);
});
test("règles Firestore : aucune lecture ou écriture directe publique, utilisateur ou admin", async () => {
  const id = await create();
  const history = (await db.collection(`prospects/${id}/history`).get()).docs[0].id;
  const prefix = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-prospection/databases/(default)/documents`;
  for (const token of [null, userToken, adminToken]) for (const path of [`prospects/${id}`, `prospects/${id}/history/${history}`, "prospection_internal/write_lock"]) {
    const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    assert.equal((await fetch(`${prefix}/${path}`, { headers })).status, 403);
    assert.equal((await fetch(`${prefix}/${path}`, { method: "PATCH", headers, body: JSON.stringify({ fields: { name: { stringValue: "forbidden" } } }) })).status, 403);
  }
});

test("ignore persists, blocks stale imports, reactivates and preserves Google data", async () => {
  const fields = { name: "Excluded", google_place_id: "excluded", google_rating: 4.6, google_user_rating_count: 327, fetched_at: "2026-09-20T12:00:00Z" };
  for (const token of [null, userToken]) assert.equal((await request("POST", { action: "ignore", fields }, undefined, token)).status, token ? 403 : 401);
  assert.equal((await request("POST", { action: "ignore", fields })).status, 200);
  const list = await (await request("GET")).json();
  assert.equal(list.ignored.length, 1); assert.equal(list.prospects.length, 0); assert.ok(list.ignored[0].ignored_by);
  const annotated = await (await request("POST", { action: "annotate", selection: [fields] })).json();
  assert.equal(annotated.results[0].duplicate.kind, "ignored");
  const blocked = await (await request("POST", { action: "import", selection: [fields] })).json();
  assert.equal(blocked.created.length, 0); assert.equal(blocked.skipped[0].duplicate.kind, "ignored");
  assert.equal((await request("POST", { action: "create", fields })).status, 409);
  for (const token of [null, userToken]) assert.equal((await request("POST", { action: "reactivate", placeId: "excluded" }, undefined, token)).status, token ? 403 : 401);
  assert.equal((await request("POST", { action: "reactivate", placeId: "excluded" })).status, 200);
  const after = await (await request("POST", { action: "annotate", selection: [fields] })).json(); assert.equal(after.results[0].duplicate, null);
  const imported = await (await request("POST", { action: "import", selection: [fields] })).json();
  const saved = (await db.doc("prospects/" + imported.created[0]).get()).data()!;
  assert.equal(saved.google_rating, 4.6); assert.equal(saved.google_user_rating_count, 327); assert.equal(saved.fetched_at, new Date(fields.fetched_at).toISOString());
  assert.equal((await request("POST", { action: "ignore", fields })).status, 409);
});
test("ignore/import concurrency cannot leave both a prospect and an exclusion", async () => {
  const fields = { name: "Race", google_place_id: "race" };
  const responses = await Promise.all([request("POST", { action: "ignore", fields }), request("POST", { action: "import", selection: [fields] })]);
  assert.ok(responses.every(response => [200, 409].includes(response.status)));
  const ignored = await db.doc("prospection_internal/discovery/ignored/race").get();
  const prospects = await db.collection("prospects").get();
  assert.equal(Number(ignored.exists) + prospects.size, 1);
});
test("exclusion rules deny SDK access, client precedence and invalid IDs", async () => {
  const fields = { name: "Former exclusion", google_place_id: "former" };
  assert.equal((await request("POST", { action: "ignore", fields })).status, 200);
  await db.doc("enseignes/new-client").set(fields);
  const data = await (await request("POST", { action: "annotate", selection: [fields] })).json();
  assert.equal(data.results[0].duplicate.kind, "client");
  assert.equal((await request("POST", { action: "ignore", fields: { name: "Missing ID" } })).status, 400);
  assert.equal((await request("POST", { action: "reactivate", placeId: "../escape" })).status, 400);
  const url = "http://" + process.env.FIRESTORE_EMULATOR_HOST + "/v1/projects/demo-prospection/databases/(default)/documents/prospection_internal/discovery/ignored/former";
  for (const token of [null, userToken, adminToken]) {
    const headers = { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) };
    assert.equal((await fetch(url, { headers })).status, 403);
    assert.equal((await fetch(url, { method: "PATCH", headers, body: JSON.stringify({ fields: {} }) })).status, 403);
  }
});

test("successive batches read persistent clients, prospects and ignored across requests", async () => {
  const batch = db.batch();
  for (let i = 0; i < 37; i++) {
    const collection = i < 12 ? "enseignes" : i < 24 ? "prospects" : "prospection_internal/discovery/ignored";
    batch.set(db.collection(collection).doc("known" + i), { name: "Known " + i, google_place_id: "p" + i, ignored_at: new Date().toISOString() });
  }
  await batch.commit();
  const savedFetch = globalThis.fetch, savedKey = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = "fake-batches-key";
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith("https://places.googleapis.com/")) return savedFetch(url, options);
    calls++; const body = JSON.parse(String(options?.body));
    if (body.pageSize === 1) return Response.json({ places: [{ location: { latitude: 51, longitude: 2 } }] });
    const page = body.pageToken ? Number(body.pageToken) : 0;
    return Response.json({ places: Array.from({ length: 20 }, (_, i) => ({ id: "p" + (page * 20 + i), displayName: { text: "Google name " + i }, location: { latitude: 51, longitude: 2 } })), ...(page < 2 ? { nextPageToken: String(page + 1) } : {}) });
  };
  const search = { action: "search", location: "Dunkerque", radius: 15, categories: ["restaurants"], limit: 50 };
  try {
    const initial = await (await request("POST", search)).json();
    assert.equal(initial.results.length, 50); assert.equal(initial.results[0].duplicate.kind, "client");
    assert.equal(initial.results[12].duplicate.kind, "prospect"); assert.equal(initial.results[24].duplicate.kind, "ignored");
    calls = 0;
    const next = await (await request("POST", { ...search, onlyNew: true })).json();
    assert.equal(next.results.length, 23); assert.equal(next.excludedCount, 37); assert.equal(calls, 4);
    assert.ok(next.results.every((result: { duplicate: unknown }) => result.duplicate === null));
    const imported = await (await request("POST", { action: "import", selection: next.results })).json(); assert.equal(imported.created.length, 23);
    calls = 0;
    const exhausted = await (await request("POST", { ...search, onlyNew: true })).json();
    assert.equal(exhausted.results.length, 0); assert.equal(exhausted.excludedCount, 60); assert.equal(calls, 4);
    calls = 0;
    assert.equal((await request("POST", { ...search, limit: 100 })).status, 400);
    assert.equal((await request("POST", { ...search, onlyNew: "yes" })).status, 400); assert.equal(calls, 0);
  } finally { globalThis.fetch = savedFetch; if (savedKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = savedKey; }
});
test("import batch is capped at 50 and accepts exactly 50 unique prospects", async () => {
  const selection = Array.from({ length: 51 }, (_, i) => ({ name: "Batch " + i, google_place_id: "batch" + i }));
  assert.equal((await request("POST", { action: "import", selection })).status, 400);
  const imported = await (await request("POST", { action: "import", selection: selection.slice(0, 50) })).json();
  assert.equal(imported.created.length, 50);
});
