import assert from "node:assert/strict";
import test from "node:test";
import { getApps, initializeApp } from "firebase-admin/app";
import { NextRequest } from "next/server";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Les tests ad-campaigns exigent Firestore et Auth Emulator.");
}

process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "true";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= "proxi-play-odzp2e";
process.env.GCLOUD_PROJECT ||= process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

// L'Admin SDK n'a besoin d'aucun compte de service contre les emulators.
// L'application preinitialisee permet au module admin du projet de reutiliser
// cette configuration sans lire de secret local.
if (getApps().length === 0) {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT });
}

let DELETE: typeof import("./app/api/admin/ad-campaigns/[id]/route").DELETE;
let PATCH: typeof import("./app/api/admin/ad-campaigns/[id]/route").PATCH;
let POST: typeof import("./app/api/admin/ad-campaigns/route").POST;
let db: ReturnType<typeof import("./lib/firebase/admin-app").getAdminDb>;
let adminToken = "";
const campaignA = "api-ad-campaign-delete-a";
const campaignB = "api-ad-campaign-delete-b";
const generatedCampaignIds: string[] = [];
const context = (id: string) => ({ params: Promise.resolve({ id }) });

function request(id: string, method = "DELETE", body?: unknown, token = adminToken) {
  return new NextRequest(`http://localhost/api/admin/ad-campaigns/${id}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
  });
}

function collectionRequest(method: string, body: unknown, token = adminToken) {
  return new NextRequest("http://localhost/api/admin/ad-campaigns", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
}

async function seedCampaign(id: string, status = "disabled") {
  await db.collection("ad_campaigns").doc(id).set({
    name: id,
    advertiser: "Annonceur test",
    placement: "open",
    image_url: "https://example.com/ad.png",
    destination_url: "https://example.com",
    start_at: new Date("2026-10-10T00:00:00Z"),
    end_at: new Date("2026-10-20T00:00:00Z"),
    frequency_cap_hours: 0,
    published: status !== "disabled",
    status,
    source_campaign_id: null,
    impressions: 4,
    clicks: 1,
  });
}

async function clearState() {
  await Promise.all([
    db.collection("ad_campaigns").doc(campaignA).delete(),
    db.collection("ad_campaigns").doc(campaignB).delete(),
    db.collection("ads").doc("open").delete(),
    db.collection("ads").doc("home_banner").delete(),
    db.collection("ads").doc("home_banner_referral").delete(),
    ...generatedCampaignIds.splice(0).map((id) => db.collection("ad_campaigns").doc(id).delete()),
  ]);
}

test.before(async () => {
  ({ DELETE } = await import("./app/api/admin/ad-campaigns/[id]/route"));
  ({ PATCH } = await import("./app/api/admin/ad-campaigns/[id]/route"));
  ({ POST } = await import("./app/api/admin/ad-campaigns/route"));
  const adminApp = await import("./lib/firebase/admin-app");
  db = adminApp.getAdminDb();
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "proxiplay.pro@gmail.com", password: "test-password", returnSecureToken: true }),
  });
  const payload = await response.json() as { idToken?: string };
  if (!response.ok || !payload.idToken) throw new Error("Impossible de creer le jeton admin Emulator.");
  adminToken = payload.idToken;
});

test.beforeEach(clearState);
test.after(clearState);

test("supprime une campagne désactivée sans modifier les autres documents", async () => {
  await seedCampaign(campaignA);
  await seedCampaign(campaignB);
  await db.collection("ads").doc("open").set({ campaign_id: "another-campaign", enabled: true });
  await db.collection("ads").doc("home_banner").set({ campaign_id: "another-home-banner", enabled: true });

  const response = await DELETE(request(campaignA), context(campaignA));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal((await db.collection("ad_campaigns").doc(campaignA).get()).exists, false);
  assert.equal((await db.collection("ad_campaigns").doc(campaignB).get()).exists, true);
  assert.deepEqual((await db.collection("ads").doc("open").get()).data(), { campaign_id: "another-campaign", enabled: true });
  assert.deepEqual((await db.collection("ads").doc("home_banner").get()).data(), { campaign_id: "another-home-banner", enabled: true });
});

test("refuse la suppression d une campagne active", async () => {
  await seedCampaign(campaignA, "active");

  const response = await DELETE(request(campaignA), context(campaignA));

  assert.equal(response.status, 409);
  assert.match((await response.json() as { error: string }).error, /désactivées/i);
  assert.equal((await db.collection("ad_campaigns").doc(campaignA).get()).exists, true);
});

test("refuse une campagne désactivée encore référencée par une projection active", async () => {
  await seedCampaign(campaignA);
  await db.collection("ads").doc("open").set({ campaign_id: campaignA, enabled: true });
  await db.collection("ads").doc("home_banner").set({ campaign_id: campaignA, enabled: true });
  await db.collection("ads").doc("home_banner_referral").set({ campaign_id: campaignA, enabled: true });

  const response = await DELETE(request(campaignA), context(campaignA));

  assert.equal(response.status, 409);
  assert.match((await response.json() as { error: string }).error, /projection publicitaire active/i);
  assert.equal((await db.collection("ad_campaigns").doc(campaignA).get()).exists, true);
  assert.equal((await db.collection("ads").doc("open").get()).data()?.campaign_id, campaignA);
  assert.equal((await db.collection("ads").doc("home_banner").get()).data()?.campaign_id, campaignA);
  assert.equal((await db.collection("ads").doc("home_banner_referral").get()).data()?.campaign_id, campaignA);
});

test("retourne 404 pour une campagne inexistante", async () => {
  const response = await DELETE(request("missing-campaign"), context("missing-campaign"));

  assert.equal(response.status, 404);
  assert.match((await response.json() as { error: string }).error, /introuvable/i);
});

test("publie, bloque les chevauchements et désactive le bandeau sous parrainage", async () => {
  const input = {
    name: "Bandeau parrainage",
    advertiser: "Annonceur test",
    placement: "home_banner_referral",
    image_url: "https://example.com/referral-banner.png",
    destination_url: "https://example.com/offre",
    start_date: "2026-10-10",
    end_date: "2026-10-20",
    frequency_cap_hours: null,
  };
  const createFirst = await POST(collectionRequest("POST", input));
  assert.equal(createFirst.status, 201);
  const firstId = (await createFirst.json() as { id: string }).id;
  generatedCampaignIds.push(firstId);
  assert.equal((await PATCH(request(firstId, "PATCH", { action: "publish" }), context(firstId))).status, 200);
  assert.equal((await db.collection("ads").doc("home_banner_referral").get()).data()?.campaign_id, firstId);

  const createSecond = await POST(collectionRequest("POST", { ...input, name: "Chevauchement" }));
  assert.equal(createSecond.status, 201);
  const secondId = (await createSecond.json() as { id: string }).id;
  generatedCampaignIds.push(secondId);
  assert.equal((await PATCH(request(secondId, "PATCH", { action: "publish" }), context(secondId))).status, 409);

  assert.equal((await PATCH(request(firstId, "PATCH", { action: "deactivate" }), context(firstId))).status, 200);
  assert.equal((await db.collection("ads").doc("home_banner_referral").get()).data()?.enabled, false);
});

test("interprète les dates civiles dans Europe/Paris à la création et à la modification", async () => {
  const input = {
    name: "Dates Paris",
    advertiser: "Annonceur test",
    placement: "home_banner",
    image_url: "https://example.com/paris-banner.png",
    destination_url: "https://example.com/offre",
    start_date: "2026-07-14",
    end_date: "2026-07-14",
    frequency_cap_hours: null,
  };
  const created = await POST(collectionRequest("POST", input));
  assert.equal(created.status, 201);
  const id = (await created.json() as { id: string }).id;
  generatedCampaignIds.push(id);

  let data = (await db.collection("ad_campaigns").doc(id).get()).data();
  assert.equal(data?.start_at?.toDate().toISOString(), "2026-07-13T22:00:00.000Z");
  assert.equal(data?.end_at?.toDate().toISOString(), "2026-07-14T22:00:00.000Z");

  const updated = await PATCH(request(id, "PATCH", { start_date: "2026-01-15", end_date: "2026-01-15" }), context(id));
  assert.equal(updated.status, 200);
  data = (await db.collection("ad_campaigns").doc(id).get()).data();
  assert.equal(data?.start_at?.toDate().toISOString(), "2026-01-14T23:00:00.000Z");
  assert.equal(data?.end_at?.toDate().toISOString(), "2026-01-15T23:00:00.000Z");
});
