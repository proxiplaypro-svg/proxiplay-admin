import assert from "node:assert/strict";
import test from "node:test";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { buildSecureGameQrLink, buildSecureGameAppLinks } from "./lib/admin/secureGameQr";

if (![process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST].every(host => host && /^(127\.0\.0\.1|localhost):\d+$/.test(host))) {
  throw new Error("Ces tests exigent les émulateurs locaux Firestore et Auth.");
}
initializeApp({ projectId: "demo-admin-qr" });
const db = getFirestore();
const gameId = "admin-secure-qr";
const token = "a1".repeat(32);
let adminToken: string;
let GET: typeof import("./app/api/admin/games/[gameId]/qr/route").GET;
let read: typeof import("./lib/admin/secureGameQrServer").readSecureGameQr;

test.before(async () => {
  ({ GET } = await import("./app/api/admin/games/[gameId]/qr/route"));
  ({ readSecureGameQr: read } = await import("./lib/admin/secureGameQrServer"));
  const result = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "proxiplay.pro@gmail.com", password: "local-test-password", returnSecureToken: true }),
  });
  const data = await result.json();
  assert.ok(data.idToken); adminToken = data.idToken;
});
test.beforeEach(async () => {
  await db.doc(`games/${gameId}`).set({ access_mode: "qr_only", status: "active", end_date: Timestamp.fromMillis(Date.now() + 86400000), enseigne_id: db.doc("enseignes/qr-shop"), qr_link: "https://proxiplay.fr/j/old", qrCodeUrl: "https://proxiplay.fr/j/old" });
  await db.doc("enseignes/qr-shop").set({ owner: db.doc("users/merchant") });
  await db.doc(`game_qr_access/${gameId}`).delete();
});
test.after(async () => {
  await Promise.all([`games/${gameId}`, `game_qr_access/${gameId}`, "enseignes/qr-shop"].map(path => db.doc(path).delete()));
  await db.terminate();
});
async function seedProof(extra = {}) {
  await db.doc(`game_qr_access/${gameId}`).set({ token, game_path: `games/${gameId}`, shop_path: "enseignes/qr-shop", owner_path: "", shop_owner_path: "users/merchant", expires_at: Timestamp.fromMillis(Date.now() + 86400000), ...extra });
}
test("lien conforme au scanner mobile, jeton conservé et jeu explicitement ciblé", () => {
  const url = new URL(buildSecureGameQrLink(gameId, token));
  assert.equal(url.origin, "https://play.proxiplay.fr");
  assert.equal(url.pathname, `/j/${gameId}`);
  assert.equal(url.searchParams.get("qr_token"), token);
  const appLinks = buildSecureGameAppLinks(gameId, token);
  assert.equal(appLinks.appUrl, `proxiplay://game/${gameId}?qr_token=${token}`);
  assert.ok(appLinks.androidIntentUrl.startsWith(`intent://game/${gameId}?qr_token=${token}#Intent;scheme=proxiplay;`));
  for (const invalid of [undefined, "", "true", "a".repeat(63), "x".repeat(64)]) assert.throws(() => buildSecureGameQrLink(gameId, invalid));
});
test("ancienne affiche sans preuve : signalement sans écriture ni fallback qr_link", async () => {
  const before = (await db.doc(`games/${gameId}`).get()).data();
  assert.deepEqual(await read(gameId), { state: "regeneration-required" });
  assert.equal((await db.doc(`game_qr_access/${gameId}`).get()).exists, false);
  assert.deepEqual((await db.doc(`games/${gameId}`).get()).data(), before);
});
test("lecture répétée conserve exactement la preuve et le lien", async () => {
  await seedProof();
  const before = (await db.doc(`game_qr_access/${gameId}`).get()).data();
  const expected = { state: "ready", url: buildSecureGameQrLink(gameId, token) };
  assert.deepEqual(await read(gameId), expected);
  assert.deepEqual(await read(gameId), expected);
  assert.deepEqual((await db.doc(`game_qr_access/${gameId}`).get()).data(), before);
});
test("preuve expirée, mauvais jeu, changement de boutique ou propriétaire : aucune rotation", async () => {
  for (const extra of [{ expires_at: Timestamp.fromMillis(1) }, { game_path: "games/other" }, { shop_path: "enseignes/other" }, { shop_owner_path: "users/other" }, { owner_path: "users/other" }, { token: "invalid" }]) {
    await seedProof(extra);
    const before = (await db.doc(`game_qr_access/${gameId}`).get()).data();
    assert.deepEqual(await read(gameId), { state: "regeneration-required" });
    assert.deepEqual((await db.doc(`game_qr_access/${gameId}`).get()).data(), before);
  }
});
test("jeu terminé et jeu public : aucun accès émis", async () => {
  await db.doc(`games/${gameId}`).update({ status: "ended" });
  assert.deepEqual(await read(gameId), { state: "ended" });
  await db.doc(`games/${gameId}`).update({ access_mode: "public" });
  assert.deepEqual(await read(gameId), { state: "public" });
  assert.equal((await db.doc(`game_qr_access/${gameId}`).get()).exists, false);
});
test("API admin protégée et réponse QR non mise en cache", async () => {
  const context = { params: Promise.resolve({ gameId }) };
  assert.equal((await GET(new Request("http://localhost/qr"), context)).status, 401);
  await seedProof();
  const response = await GET(new Request("http://localhost/qr", { headers: { authorization: `Bearer ${adminToken}` } }), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { state: "ready", url: buildSecureGameQrLink(gameId, token) });
});
test("export PDF refuse un ancien lien générique et exige une session admin pour le QR-only", async () => {
  const { POST } = await import("./app/api/generate-poster/route");
  const request = (authenticated: boolean) => new Request("http://localhost/api/generate-poster", {
    method: "POST", headers: { "content-type": "application/json", ...(authenticated ? { authorization: `Bearer ${adminToken}` } : {}) },
    body: JSON.stringify({ gameId }),
  });
  assert.equal((await POST(request(false))).status, 401);
  const response = await POST(request(true));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /réimpression/);
  assert.equal((await db.doc(`game_qr_access/${gameId}`).get()).exists, false);
});
