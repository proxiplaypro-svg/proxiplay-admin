import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Les tests referral-games exigent Firestore et Auth Emulator.");
}
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "true";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= "proxi-play-odzp2e";
process.env.GCLOUD_PROJECT ||= process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

let DELETE: typeof import("./app/api/admin/referral-games/[id]/route").DELETE;
let PATCH: typeof import("./app/api/admin/referral-games/[id]/route").PATCH;
let POST: typeof import("./app/api/admin/referral-games/route").POST;
let db: ReturnType<typeof import("./lib/firebase/admin-app").getAdminDb>;
const gameA = "api-referral-game-a";
const gameB = "api-referral-game-b";
const context = (id: string) => ({ params: Promise.resolve({ id }) });
let adminToken = "";

function request(url: string, method: string, body?: unknown, token = adminToken) {
  return new NextRequest(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) } });
}

async function deleteGame(id: string) {
  const gameRef = db.collection("referral_games").doc(id);
  const entries = await gameRef.collection("entries").get();
  await Promise.all(entries.docs.map((entry) => entry.ref.delete()));
  const prizes = await db.collection("prizes").where("referral_game_id", "==", id).get();
  await Promise.all(prizes.docs.map((prize) => prize.ref.delete()));
  await gameRef.delete();
}

async function seedGame(id: string, data: Record<string, unknown> = {}) {
  await db.collection("referral_games").doc(id).set({ title: id, status: "draft", ticket_count: 0, ...data });
}

test.before(async () => {
  ({ DELETE, PATCH } = await import("./app/api/admin/referral-games/[id]/route"));
  ({ POST } = await import("./app/api/admin/referral-games/route"));
  const adminApp = await import("./lib/firebase/admin-app");
  db = adminApp.getAdminDb();
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "proxiplay.pro@gmail.com", password: "test-password", returnSecureToken: true }) });
  const payload = await response.json() as { idToken?: string };
  if (!response.ok || !payload.idToken) throw new Error("Impossible de creer le jeton admin Emulator.");
  adminToken = payload.idToken;
});

test.beforeEach(async () => { await Promise.all([deleteGame(gameA), deleteGame(gameB)]); });

test("un appel non authentifie ne peut ni creer ni activer ni supprimer un jeu", async () => {
  const createResponse = await POST(request("http://localhost/api/admin/referral-games", "POST", {}, ""));
  const activateResponse = await PATCH(request(`http://localhost/api/admin/referral-games/${gameA}`, "PATCH", { status: "active" }, ""), context(gameA));
  const deleteResponse = await DELETE(request(`http://localhost/api/admin/referral-games/${gameA}`, "DELETE", undefined, ""), context(gameA));

  for (const response of [createResponse, activateResponse, deleteResponse]) {
    assert.equal(response.status, 401);
  }
});

test("activation admin reussit lorsqu aucun jeu actif n existe", async () => {
  await seedGame(gameB);
  const response = await PATCH(request(`http://localhost/api/admin/referral-games/${gameB}`, "PATCH", { status: "active" }), context(gameB));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal((await db.collection("referral_games").doc(gameB).get()).data()?.status, "active");
});

test("activation admin refuse un second jeu actif sans etat partiel", async () => {
  await seedGame(gameA, { status: "active" });
  await seedGame(gameB);
  const response = await PATCH(request(`http://localhost/api/admin/referral-games/${gameB}`, "PATCH", { status: "active" }), context(gameB));
  assert.equal(response.status, 409);
  assert.match((await response.json() as { error: string }).error, /autre jeu/i);
  assert.equal((await db.collection("referral_games").doc(gameA).get()).data()?.status, "active");
  assert.equal((await db.collection("referral_games").doc(gameB).get()).data()?.status, "draft");
});

test("suppression admin autorisee uniquement pour un draft vide", async () => {
  await seedGame(gameA);
  const response = await DELETE(request(`http://localhost/api/admin/referral-games/${gameA}`, "DELETE"), context(gameA));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal((await db.collection("referral_games").doc(gameA).get()).exists, false);
});

test("suppression admin refuse jeu actif sans titre, tire ou draft avec participant", async () => {
  await seedGame(gameA, { status: "active" });
  let response = await DELETE(request(`http://localhost/api/admin/referral-games/${gameA}`, "DELETE"), context(gameA));
  assert.equal(response.status, 400);
  assert.equal((await db.collection("referral_games").doc(gameA).get()).exists, true);
  await db.collection("referral_games").doc(gameA).set({ status: "draft", winner_uid: "winner" }, { merge: true });
  response = await DELETE(request(`http://localhost/api/admin/referral-games/${gameA}`, "DELETE"), context(gameA));
  assert.equal(response.status, 409);
  await db.collection("referral_games").doc(gameA).set({ winner_uid: null }, { merge: true });
  const prizeRef = db.collection("prizes").doc("api-referral-game-prize");
  await prizeRef.set({ referral_game_id: gameA });
  response = await DELETE(request(`http://localhost/api/admin/referral-games/${gameA}`, "DELETE"), context(gameA));
  assert.equal(response.status, 409);
  assert.equal((await prizeRef.get()).exists, true);
  await prizeRef.delete();
  await db.collection("referral_games").doc(gameA).collection("entries").doc("referral-1").set({ inviter_uid: "player" });
  response = await DELETE(request(`http://localhost/api/admin/referral-games/${gameA}`, "DELETE"), context(gameA));
  assert.equal(response.status, 409);
  assert.equal((await db.collection("referral_games").doc(gameA).get()).exists, true);
  assert.equal((await db.collection("referral_games").doc(gameA).collection("entries").doc("referral-1").get()).exists, true);
});

// Suspension (27/10/2026): "active" -> "draft" came back within 15 minutes
// (autoManageReferralGames starts due drafts); "suspended" never does.
const hour = 3600 * 1000;
const validDates = () => ({
  start_date: Timestamp.fromMillis(Date.now() - hour),
  end_date: Timestamp.fromMillis(Date.now() + hour),
});
const patchStatus = (id: string, status: string) =>
  PATCH(request(`http://localhost/api/admin/referral-games/${id}`, "PATCH", { status }), context(id));
const statusOf = async (id: string) => (await db.collection("referral_games").doc(id).get()).data()?.status;

test("suspendre puis reactiver un jeu encore valide ; cloturer un jeu suspendu", async () => {
  await seedGame(gameA, { status: "active", ...validDates() });
  assert.equal((await patchStatus(gameA, "suspended")).status, 200);
  assert.equal(await statusOf(gameA), "suspended");
  assert.equal((await patchStatus(gameA, "active")).status, 200);
  assert.equal(await statusOf(gameA), "active");
  assert.equal((await patchStatus(gameA, "suspended")).status, 200);
  assert.equal((await patchStatus(gameA, "ended")).status, 200);
  assert.equal(await statusOf(gameA), "ended");
});

test("reactivation refusee si le jeu n est plus valide ou si un autre jeu est actif", async () => {
  for (const [label, data, message] of [
    ["date de fin passee", { end_date: Timestamp.fromMillis(Date.now() - 1000) }, /date de fin/i],
    ["pas encore commence", { start_date: Timestamp.fromMillis(Date.now() + hour), end_date: Timestamp.fromMillis(Date.now() + 2 * hour) }, /date de debut/i],
    ["deja tire", { winner_uid: "winner" }, /tire/i],
  ] as const) {
    await seedGame(gameA, { status: "suspended", ...validDates(), ...data });
    const response = await patchStatus(gameA, "active");
    assert.equal(response.status, 409, label);
    assert.match((await response.json() as { error: string }).error, message, label);
    assert.equal(await statusOf(gameA), "suspended", label);
    await deleteGame(gameA);
  }
  await seedGame(gameA, { status: "suspended", ...validDates() });
  await seedGame(gameB, { status: "active", ...validDates() });
  const response = await patchStatus(gameA, "active");
  assert.equal(response.status, 409);
  assert.match((await response.json() as { error: string }).error, /autre jeu/i);
  assert.equal(await statusOf(gameA), "suspended");
});

test("transitions interdites : actif -> brouillon, termine -> actif, brouillon -> suspendu", async () => {
  for (const [from, to] of [["active", "draft"], ["ended", "active"], ["draft", "suspended"]]) {
    await seedGame(gameA, { status: from, ...validDates() });
    const response = await patchStatus(gameA, to);
    assert.equal(response.status, 409, `${from} -> ${to}`);
    assert.equal(await statusOf(gameA), from, `${from} -> ${to}`);
    await deleteGame(gameA);
  }
  // Editing a game without changing its status stays possible.
  await seedGame(gameA, { status: "suspended", ...validDates() });
  const edit = await PATCH(request(`http://localhost/api/admin/referral-games/${gameA}`, "PATCH", { title: "Nouveau titre" }), context(gameA));
  assert.equal(edit.status, 200);
  assert.equal(await statusOf(gameA), "suspended");
});

test("suppression d un jeu actif ou suspendu : titre exact obligatoire, tickets toujours proteges", async () => {
  for (const status of ["active", "suspended"]) {
    await seedGame(gameA, { status, title: "Jeu de test" });
    let response = await DELETE(request(`http://localhost/api/admin/referral-games/${gameA}`, "DELETE", { confirm_title: "Autre" }), context(gameA));
    assert.equal(response.status, 400, status);
    assert.equal((await db.collection("referral_games").doc(gameA).get()).exists, true, status);
    await db.collection("referral_games").doc(gameA).collection("entries").doc("referral-1").set({ inviter_uid: "player" });
    response = await DELETE(request(`http://localhost/api/admin/referral-games/${gameA}`, "DELETE", { confirm_title: "Jeu de test" }), context(gameA));
    assert.equal(response.status, 409, `${status} avec ticket`);
    await db.collection("referral_games").doc(gameA).collection("entries").doc("referral-1").delete();
    response = await DELETE(request(`http://localhost/api/admin/referral-games/${gameA}`, "DELETE", { confirm_title: " Jeu de test " }), context(gameA));
    assert.equal(response.status, 200, status);
    assert.equal((await db.collection("referral_games").doc(gameA).get()).exists, false, status);
  }
});
