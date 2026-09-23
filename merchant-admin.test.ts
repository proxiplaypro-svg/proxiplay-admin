import assert from "node:assert/strict";
import test from "node:test";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { commerceFields, ownerUid } from "./lib/admin/merchantSchema";

if (![process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST].every(host => host && /^(localhost|127\.0\.0\.1):\d+$/.test(host))) throw new Error("Tests réservés aux émulateurs locaux Auth et Firestore.");
initializeApp({ projectId: "demo-admin-merchants" });
const db = getFirestore();
const auth = getAuth();
let token: string;
let userToken: string;
let playerUid: string;
let POST: typeof import("./app/api/admin/marchands/route").POST;
let PATCH: typeof import("./app/api/admin/marchands/route").PATCH;
let GET: typeof import("./app/api/admin/marchands/route").GET;
const base = { name: "Boulangerie du centre", category: ["Boulangerie"], first_name: "Camille", last_name: "Martin", account_phone: "0600000000", city: "Lyon" };
let sequence = 0;
function email() { return `merchant-${++sequence}@example.test`; }
async function signup(email: string) {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "local-test-password", returnSecureToken: true }) });
  const data = await response.json(); assert.ok(data.idToken); return data;
}
function request(method: string, body?: unknown, merchantId?: string, bearer: string | null = token) {
  return new Request(`http://localhost/api/admin/marchands${merchantId ? `?merchantId=${merchantId}` : ""}`, { method, headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function create(extra: Record<string, unknown> = {}) {
  const response = await POST(request("POST", { ...base, email: email(), ...extra }));
  assert.equal(response.status, 201, await response.clone().text()); return response.json();
}
test.before(async () => {
  ({ POST, PATCH, GET } = await import("./app/api/admin/marchands/route"));
  token = (await signup("proxiplay.pro@gmail.com")).idToken;
  const player = await signup("player@example.test");
  userToken = player.idToken; playerUid = player.localId;
});
test.after(async () => { await db.terminate(); });

test("categories endpoint reads Firestore labels, is admin-only and makes no writes", async () => {
  const { GET: categories } = await import("./app/api/admin/marchands/categories/route");
  assert.equal((await categories(request("GET", undefined, undefined, null))).status, 401);
  assert.equal((await categories(request("GET", undefined, undefined, userToken))).status, 403);
  await db.doc("enseignes/category-source").set({ category: ["Loisirs, sport & culture", "Beauté & bien-être"], status: "inactive" });
  const before = await db.collection("enseignes").get();
  const response = await categories(request("GET"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const result = await response.json();
  assert.ok(result.categories.some((item: { value: string; label: string }) => item.value === "Loisirs, sport & culture" && item.label === item.value));
  assert.equal((await db.collection("enseignes").get()).size, before.size);
  assert.deepEqual((await db.doc("enseignes/category-source").get()).data(), { category: ["Loisirs, sport & culture", "Beauté & bien-être"], status: "inactive" });
});

test("creation and editing preserve multiple exact category labels and old values", async () => {
  const category = ["Maison, jardin & bricolage", "Ancienne catégorie"];
  const { merchantId } = await create({ mode: "shop", category });
  assert.deepEqual((await db.doc(`enseignes/${merchantId}`).get()).get("category"), category);
  assert.equal((await PATCH(request("PATCH", { action: "profile", fields: { phone: "0328000000" } }, merchantId))).status, 200);
  assert.deepEqual((await db.doc(`enseignes/${merchantId}`).get()).get("category"), category);
  assert.equal((await PATCH(request("PATCH", { action: "profile", fields: { category: [category[0]] } }, merchantId))).status, 200);
  assert.deepEqual((await db.doc(`enseignes/${merchantId}`).get()).get("category"), [category[0]]);
});

test("A : création active, profil commerçant, références cohérentes, aucun secret retourné", async () => {
  const result = await create();
  const shop = (await db.doc(`enseignes/${result.merchantId}`).get()).data()!;
  const uid = ownerUid(shop);
  const user = (await db.doc(`users/${uid}`).get()).data()!;
  assert.equal(user.user_role, "commercant"); assert.equal(user.account_status, "active");
  assert.equal(user.first_name, "Camille"); assert.equal((await auth.getUser(uid)).disabled, false);
  assert.equal(shop.owner, `/users/${uid}`); assert.equal(shop.owner_id.path, `users/${uid}`);
  assert.equal(shop.status, "active"); assert.equal(shop.commercial_status, "actif");
  assert.deepEqual(Object.keys(result).sort(), ["email", "merchantId"]);
  for (const field of ["approved", "profile_completed", "isProfessional", "role"]) assert.equal(field in user, false);
});
test("création désactivée sans attente d’approbation", async () => {
  const result = await create({ active: false });
  const uid = ownerUid((await db.doc(`enseignes/${result.merchantId}`).get()).data()!);
  assert.equal((await auth.getUser(uid)).disabled, true);
  assert.equal((await db.doc(`users/${uid}`).get()).data()?.account_status, "inactive");
});
test("B/D : doublon identifié et association explicite sans écraser le profil existant", async () => {
  const result = await create();
  const original = (await db.doc(`enseignes/${result.merchantId}`).get()).data()!;
  const userRef = original.owner_id;
  await userRef.update({ custom_legacy: { untouched: true } });
  const before = (await userRef.get()).data();
  const duplicate = await POST(request("POST", { ...base, email: result.email }));
  assert.equal(duplicate.status, 409); assert.equal((await duplicate.json()).code, "existing-merchant");
  const associated = await create({ email: result.email, mode: "existing", active: false, first_name: "Ne pas écraser" });
  assert.equal(ownerUid((await db.doc(`enseignes/${associated.merchantId}`).get()).data()!), userRef.id);
  assert.deepEqual((await userRef.get()).data(), before);
  const denied = await POST(request("POST", { ...base, email: "player@example.test", mode: "existing" }));
  assert.equal(denied.status, 409);
});
test("C/D : fiche seule, puis association et contrôle du propriétaire attendu", async () => {
  const before = (await auth.listUsers()).users.length;
  const shop = await create({ mode: "shop", email: "" });
  assert.equal((await auth.listUsers()).users.length, before);
  assert.equal(ownerUid((await db.doc(`enseignes/${shop.merchantId}`).get()).data()!), "");
  const existing = await create();
  const response = await PATCH(request("PATCH", { action: "associate", email: existing.email, expectedOwner: "" }, shop.merchantId));
  assert.equal(response.status, 200);
  const stale = await PATCH(request("PATCH", { action: "associate", email: existing.email, expectedOwner: "" }, shop.merchantId));
  assert.equal(stale.status, 409);
});
test("E : email de définition via le mécanisme Firebase existant, lien émis dans l’émulateur", async () => {
  const result = await create();
  const current = await GET(request("GET", undefined, result.merchantId));
  const { account } = await current.json();
  const response = await PATCH(request("PATCH", { action: "reset", expectedOwner: account.uid }, result.merchantId));
  assert.equal(response.status, 200);
  const payload = await response.json(); assert.equal(payload.email, result.email);
  const sent = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestType: "PASSWORD_RESET", email: payload.email }) });
  assert.equal(sent.status, 200);
  const codes = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/demo-admin-merchants/oobCodes`).then(r => r.json());
  assert.ok(codes.oobCodes.some((code: { email: string; requestType: string }) => code.email === result.email && code.requestType === "PASSWORD_RESET"));
});
test("F : les trois méthodes refusent les sessions absentes et non admin", async () => {
  for (const method of ["POST", "GET", "PATCH"] as const) {
    const handler = { POST, GET, PATCH }[method];
    assert.equal((await handler(request(method, method === "GET" ? undefined : base, "shop", null))).status, 401);
    assert.equal((await handler(request(method, method === "GET" ? undefined : base, "shop", userToken))).status, 403);
  }
});
test("G : échec de transaction supprime le nouveau compte Auth, aucun profil/commerce partiel", async () => {
  const target = email();
  const before = (await db.collection("enseignes").get()).size;
  const mock = test.mock.method(db, "runTransaction", async () => { throw new Error("injected failure"); });
  try {
    assert.equal((await POST(request("POST", { ...base, email: target }))).status, 500);
    await assert.rejects(auth.getUserByEmail(target), { code: "auth/user-not-found" });
    assert.equal((await db.collection("enseignes").get()).size, before);
    assert.equal((await db.collection("users").where("email", "==", target).get()).size, 0);
  } finally { mock.mock.restore(); }
});
test("H : édition partielle préserve champs historiques, liens, données CRM et propriétaire", async () => {
  const result = await create();
  const ref = db.doc(`enseignes/${result.merchantId}`);
  await ref.update({ legacy_nested: { flag: true }, facebook_link: "https://example.test", admin_note: "Historique", category: ["Ancienne"], logo: "https://example.test/photo.png" });
  const before = (await ref.get()).data()!;
  assert.equal((await PATCH(request("PATCH", { action: "profile", fields: { description: "Nouvelle description", area_code: "69001" } }, result.merchantId))).status, 200);
  assert.deepEqual((await ref.get()).data(), { ...before, description: "Nouvelle description", area_code: "69001" });
  assert.equal((await PATCH(request("PATCH", { action: "profile", fields: { owner: "/users/attack" } }, result.merchantId))).status, 400);
});
test("activation et identité synchronisées ; rollback Auth si la sauvegarde du profil échoue", async () => {
  const result = await create();
  const { account } = await (await GET(request("GET", undefined, result.merchantId))).json();
  const payload = { ...account, action: "update", expectedOwner: account.uid, active: false, first_name: "Nouveau prénom" };
  assert.equal((await PATCH(request("PATCH", payload, result.merchantId))).status, 200);
  assert.equal((await auth.getUser(account.uid)).disabled, true);
  assert.equal((await db.doc(`users/${account.uid}`).get()).data()?.first_name, "Nouveau prénom");
  const mock = test.mock.method(db, "runTransaction", async () => { throw new Error("injected failure"); });
  try {
    assert.equal((await PATCH(request("PATCH", { ...payload, active: true }, result.merchantId))).status, 500);
    assert.equal((await auth.getUser(account.uid)).disabled, true);
  } finally { mock.mock.restore(); }
});

test("modification email : unicité et synchronisation Auth, profil et commerces associés", async () => {
  const result = await create();
  const second = await create({ mode: "existing", email: result.email });
  const { account } = await (await GET(request("GET", undefined, result.merchantId))).json();
  const replacement = email();
  const payload = { ...account, action: "update", expectedOwner: account.uid, email: replacement };
  assert.equal((await PATCH(request("PATCH", payload, result.merchantId))).status, 200);
  assert.equal((await auth.getUser(account.uid)).email, replacement);
  assert.equal((await db.doc(`users/${account.uid}`).get()).data()?.email, replacement);
  for (const id of [result.merchantId, second.merchantId]) assert.equal((await db.doc(`enseignes/${id}`).get()).data()?.email, replacement);
  assert.equal((await PATCH(request("PATCH", { ...payload, email: "player@example.test" }, result.merchantId))).status, 409);
  assert.equal((await auth.getUser(account.uid)).email, replacement);
  const mock = test.mock.method(db, "runTransaction", async () => { throw new Error("email transaction failure"); });
  try {
    assert.equal((await PATCH(request("PATCH", { ...payload, email: email() }, result.merchantId))).status, 500);
    assert.equal((await auth.getUser(account.uid)).email, replacement);
    assert.equal((await db.doc(`users/${account.uid}`).get()).data()?.email, replacement);
  } finally { mock.mock.restore(); }
});
test("validation serveur et compatibilité des anciennes références", () => {
  for (const input of [{ name: "" }, { name: "Shop", category: "wrong" }, { name: "Shop", site_web_url: "javascript:alert(1)" }]) assert.throws(() => commerceFields(input));
  assert.equal(ownerUid({ owner: "/users/old" }), "old");
  assert.equal(ownerUid({ owner: db.doc("users/old") }), "old");
  assert.equal(ownerUid({ owner_id: db.doc("users/old") }), "old");
  assert.throws(() => ownerUid({ owner: "/users/one", owner_id: db.doc("users/two") }));
});

test("règles : un joueur ne peut ni se promouvoir, ni modifier les propriétaires ; profil ordinaire conservé", async () => {
  await db.doc(`users/${playerUid}`).set({ user_role: "joueur", account_status: "active", first_name: "Joueur" });
  async function write(path: string, fields: Record<string, unknown>) {
    return fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-admin-merchants/databases/(default)/documents/${path}?${Object.keys(fields).map(key => `updateMask.fieldPaths=${key}`).join("&")}`, { method: "PATCH", headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
  }
  assert.equal((await write(`users/${playerUid}`, { user_role: { stringValue: "commercant" } })).status, 403);
  assert.equal((await write(`users/${playerUid}`, { account_status: { stringValue: "inactive" } })).status, 403);
  assert.equal((await write(`users/${playerUid}`, { first_name: { stringValue: "Nouveau" } })).status, 200);
  const shop = await create();
  assert.equal((await write(`enseignes/${shop.merchantId}`, { owner: { stringValue: `/users/${playerUid}` } })).status, 403);
});

test("G : accusé de transaction perdu après commit, les documents et le compte sont conservés", async () => {
  const original = db.runTransaction.bind(db);
  const mock = test.mock.method(db, "runTransaction", async (...args: Parameters<typeof db.runTransaction>) => {
    await original(...args);
    throw new Error("lost acknowledgement");
  });
  try {
    const result = await create();
    const shop = (await db.doc(`enseignes/${result.merchantId}`).get()).data()!;
    assert.equal((await auth.getUser(ownerUid(shop))).email, result.email);
    assert.ok((await db.doc(`users/${ownerUid(shop)}`).get()).exists);
  } finally { mock.mock.restore(); }
});

test("gestion Proxiplay : création explicite dans les trois modes, défaut historique et édition true/false", async () => {
  const first = await create({ managed_by_admin: true });
  for (const result of [first, await create({ mode: "shop", managed_by_admin: true }), await create({ mode: "existing", email: first.email, managed_by_admin: true })]) {
    assert.equal((await db.doc(`enseignes/${result.merchantId}`).get()).data()?.managed_by_admin, true);
  }
  const normal = await create({ mode: "shop" });
  assert.equal((await db.doc(`enseignes/${normal.merchantId}`).get()).data()?.managed_by_admin, false);
  for (const mode of [true, false]) {
    assert.equal((await PATCH(request("PATCH", { action: "profile", fields: { managed_by_admin: mode } }, normal.merchantId))).status, 200);
    assert.equal((await db.doc(`enseignes/${normal.merchantId}`).get()).data()?.managed_by_admin, mode);
  }
  for (const invalid of ["true", 1, null]) assert.equal((await POST(request("POST", { ...base, mode: "shop", managed_by_admin: invalid }))).status, 400);
  assert.equal((await PATCH(request("PATCH", { action: "profile", fields: { managed_by_admin: "false" } }, normal.merchantId))).status, 400);
});

test("gestion Proxiplay : statistiques lisibles, fiche/jeux réservés à l’admin, historique autonome inchangé", async () => {
  const shopRef = db.doc("enseignes/managed-rules");
  const stats = { views: 15, participations_count: 7, winners_count: 2 };
  await shopRef.set({ name: "Commerce", email: "player@example.test", owner_id: db.doc(`users/${playerUid}`), managed_by_admin: true, ...stats });
  const prefix = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-admin-merchants/databases/(default)/documents`;
  async function read(path: string) { return fetch(`${prefix}/${path}`, { headers: { Authorization: `Bearer ${userToken}` } }); }
  async function write(path: string, fields: Record<string, unknown>, bearer = userToken) {
    return fetch(`${prefix}/${path}?${Object.keys(fields).map(key => `updateMask.fieldPaths=${key}`).join("&")}`, { method: "PATCH", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
  }
  const visible = await read(shopRef.path);
  assert.equal(visible.status, 200); assert.equal((await visible.json()).fields.participations_count.integerValue, "7");
  assert.equal((await write(shopRef.path, { name: { stringValue: "Interdit" } })).status, 403);
  assert.equal((await write(shopRef.path, { managed_by_admin: { booleanValue: false } })).status, 403);
  assert.equal((await write(shopRef.path, { name: { stringValue: "Par admin" } }, token)).status, 200);
  for (const collection of ["games", "jeux"]) {
    const game = db.doc(`${collection}/managed-game`);
    await game.set({ enseigne_id: shopRef, name: "Jeu", views: 17 });
    assert.equal((await read(game.path)).status, 200);
    assert.equal((await write(game.path, { name: { stringValue: "Interdit" } })).status, 403);
    assert.equal((await write(game.path, { name: { stringValue: "Par admin" } }, token)).status, 200);
    assert.equal((await fetch(`${prefix}/${game.path}`, { method: "DELETE", headers: { Authorization: `Bearer ${userToken}` } })).status, 403);
  }
  await db.doc("games/managed-legacy-id").set({ merchantId: shopRef.id });
  assert.equal((await write("games/managed-legacy-id", { name: { stringValue: "Interdit" } })).status, 403);
  // Absence of the field retains normal historical access; no migration.
  const { FieldValue } = await import("firebase-admin/firestore");
  await shopRef.update({ managed_by_admin: FieldValue.delete() });
  assert.equal((await write(shopRef.path, { name: { stringValue: "Autonome" } })).status, 200);
  assert.equal((await write("games/managed-game", { name: { stringValue: "Autonome" } })).status, 200);
  assert.equal((await write(shopRef.path, { managed_by_admin: { booleanValue: true } })).status, 403);
  const final = (await shopRef.get()).data()!;
  for (const [key, value] of Object.entries(stats)) assert.equal(final[key], value);
});
