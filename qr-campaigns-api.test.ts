import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { getApps, initializeApp } from "firebase-admin/app";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Les tests qr-campaigns exigent Firestore et Auth Emulator.");
}
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "true";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= "proxi-play-odzp2e";
process.env.GCLOUD_PROJECT ||= process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
// Application Admin sur le projet des emulateurs (comme ad-campaigns-api.test.ts).
if (getApps().length === 0) initializeApp({ projectId: process.env.GCLOUD_PROJECT });

type Routes = {
  list: typeof import("./app/api/admin/qr-campaigns/route");
  item: typeof import("./app/api/admin/qr-campaigns/[id]/route");
  stats: typeof import("./app/api/admin/qr-campaigns/[id]/stats/route");
};
let routes: Routes;
let db: ReturnType<typeof import("./lib/firebase/admin-app").getAdminDb>;
let adminToken = "";
let playerToken = "";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const BUS = { id: "bus_dunkerque", name: "Bus Dunkerque", slug: "bus", destinationUrl: "https://onelink.to/jx4ee7", channel: "bus" };
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";

function call(url: string, method = "GET", body?: unknown, token = adminToken) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
}

async function signUp(email: string) {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "test-password", returnSecureToken: true }) });
  const payload = await response.json() as { idToken?: string };
  if (!payload.idToken) throw new Error(`Jeton Emulator impossible pour ${email}`);
  return payload.idToken;
}

test.before(async () => {
  routes = {
    list: await import("./app/api/admin/qr-campaigns/route"),
    item: await import("./app/api/admin/qr-campaigns/[id]/route"),
    stats: await import("./app/api/admin/qr-campaigns/[id]/stats/route"),
  };
  db = (await import("./lib/firebase/admin-app")).getAdminDb();
  adminToken = await signUp("proxiplay.pro@gmail.com");
  playerToken = await signUp(`joueur-${Date.now()}@example.test`);
});

test.beforeEach(async () => {
  await db.recursiveDelete(db.collection("qr_campaigns"));
  await db.recursiveDelete(db.collection("qr_campaign_slugs"));
});

async function createBus() {
  const response = await routes.list.POST(call("/api/admin/qr-campaigns", "POST", BUS));
  assert.equal(response.status, 201);
  return (await response.json()).campaign;
}

test("accès réservé aux administrateurs : 401 sans jeton, 403 pour un joueur", async () => {
  await createBus();
  for (const [token, status] of [["", 401], [playerToken, 403]] as const) {
    const responses = [
      await routes.list.GET(call("/api/admin/qr-campaigns", "GET", undefined, token)),
      await routes.list.POST(call("/api/admin/qr-campaigns", "POST", { ...BUS, id: "autre_campagne", slug: "autre" }, token)),
      await routes.item.GET(call("/api/admin/qr-campaigns/bus_dunkerque", "GET", undefined, token), ctx("bus_dunkerque")),
      await routes.item.PATCH(call("/api/admin/qr-campaigns/bus_dunkerque", "PATCH", { destinationUrl: "https://www.proxiplay.fr/" }, token), ctx("bus_dunkerque")),
      await routes.stats.GET(call("/api/admin/qr-campaigns/bus_dunkerque/stats?from=2026-12-01&to=2026-12-02", "GET", undefined, token), ctx("bus_dunkerque")),
    ];
    for (const response of responses) assert.equal(response.status, status);
  }
  assert.equal((await db.doc("qr_campaign_slugs/bus").get()).data()?.destination_url, BUS.destinationUrl);
  assert.equal((await db.collection("qr_campaign_slugs").get()).size, 1);
});

test("création de bus_dunkerque : à préparer, URL https://proxiplay.fr/bus, fiche de chemin et journal", async () => {
  const campaign = await createBus();
  assert.equal(campaign.status, "draft");
  assert.equal(campaign.publicUrl, "https://proxiplay.fr/bus");
  assert.equal(campaign.destinationUrl, "https://onelink.to/jx4ee7");
  const slug = (await db.doc("qr_campaign_slugs/bus").get()).data();
  assert.equal(slug?.campaign_id, "bus_dunkerque");
  assert.equal(slug?.status, "draft");
  const changes = await db.collection("qr_campaigns/bus_dunkerque/changes").get();
  assert.equal(changes.size, 1);
  assert.equal(changes.docs[0].data().by, "proxiplay.pro@gmail.com");
  // Une campagne est toujours creee a preparer, meme si on demande active.
  const other = await routes.list.POST(call("/api/admin/qr-campaigns", "POST", { ...BUS, id: "flyer_2027", slug: "flyer-2027", status: "active" }));
  assert.equal((await other.json()).campaign.status, "draft");
});

test("refus : doublons, chemin réservé, destination non autorisée, identifiant invalide", async () => {
  await createBus();
  const cases: Array<[Record<string, unknown>, number]> = [
    [BUS, 409],
    [{ ...BUS, id: "bus_lille" }, 409],
    [{ ...BUS, id: "joueurs_page", slug: "joueurs" }, 400],
    [{ ...BUS, id: "evil_campaign", slug: "evil", destinationUrl: "https://evil.example/" }, 400],
    [{ ...BUS, id: "http_campaign", slug: "http", destinationUrl: "http://onelink.to/jx4ee7" }, 400],
    [{ ...BUS, id: "Bus-Dunkerque", slug: "bus2" }, 400],
    [{ ...BUS, id: "no_name", slug: "noname", name: " " }, 400],
  ];
  for (const [body, status] of cases) {
    const response = await routes.list.POST(call("/api/admin/qr-campaigns", "POST", body));
    assert.equal(response.status, status, JSON.stringify(body));
  }
  assert.equal((await db.collection("qr_campaigns").get()).size, 1);
});

test("changer la destination ne change ni l'URL ni le chemin, et la redirection suit", async () => {
  await createBus();
  const response = await routes.item.PATCH(call("/api/admin/qr-campaigns/bus_dunkerque", "PATCH",
    { destinationUrl: "https://apps.apple.com/fr/app/proxiplay/id6753818573", status: "active", launchAt: "2026-12-01T08:00" }), ctx("bus_dunkerque"));
  assert.equal(response.status, 200);
  const campaign = (await response.json()).campaign;
  assert.equal(campaign.publicUrl, "https://proxiplay.fr/bus");
  assert.equal(campaign.status, "active");
  assert.equal(campaign.launchAt, "2026-12-01T07:00:00.000Z");
  const slug = (await db.doc("qr_campaign_slugs/bus").get()).data();
  assert.equal(slug?.destination_url, "https://apps.apple.com/fr/app/proxiplay/id6753818573");
  assert.equal(slug?.status, "active");

  const { createQrRedirectHandler } = await import("./lib/qr/qrRedirect");
  const { createFirestoreQrStore } = await import("./lib/qr/firestoreQrStore");
  const handler = createQrRedirectHandler({ store: createFirestoreQrStore(() => db), resolveTimeoutMs: 5000 });
  const result = await handler.handle(new Request("https://admin.proxiplay.fr/api/public/qr/bus", { headers: { "user-agent": IPHONE } }), "bus");
  assert.equal(result.response.headers.get("location"), "https://apps.apple.com/fr/app/proxiplay/id6753818573");

  const refused = await routes.item.PATCH(call("/api/admin/qr-campaigns/bus_dunkerque", "PATCH", { slug: "bus2" }), ctx("bus_dunkerque"));
  assert.equal(refused.status, 400);
  const invalid = await routes.item.PATCH(call("/api/admin/qr-campaigns/bus_dunkerque", "PATCH", { destinationUrl: "https://evil.example/" }), ctx("bus_dunkerque"));
  assert.equal(invalid.status, 400);
  const detail = await (await routes.item.GET(call("/api/admin/qr-campaigns/bus_dunkerque"), ctx("bus_dunkerque"))).json();
  const update = detail.changes.find((change: { kind: string }) => change.kind === "updated");
  assert.deepEqual(update.changes.destination_url, { from: "https://onelink.to/jx4ee7", to: "https://apps.apple.com/fr/app/proxiplay/id6753818573" });
  assert.deepEqual(update.changes.status, { from: "draft", to: "active" });
});

test("comptage réel : une écriture par ouverture, simultanées réparties sur 4 documents horaires", async () => {
  await createBus();
  await routes.item.PATCH(call("/api/admin/qr-campaigns/bus_dunkerque", "PATCH", { status: "active" }), ctx("bus_dunkerque"));
  const { createQrRedirectHandler } = await import("./lib/qr/qrRedirect");
  const { createFirestoreQrStore } = await import("./lib/qr/firestoreQrStore");
  const handler = createQrRedirectHandler({
    store: createFirestoreQrStore(() => db), resolveTimeoutMs: 5000, writeTimeoutMs: 10_000,
    now: () => new Date("2026-12-01T07:15:00Z"),
  });
  const results = await Promise.all(Array.from({ length: 40 }, (_, i) => handler.handle(new Request("https://admin.proxiplay.fr/api/public/qr/bus", {
    headers: { "user-agent": i % 4 === 0 ? "Mozilla/5.0 (Linux; Android 14) Chrome/124.0 Mobile" : IPHONE, "x-forwarded-for": `10.1.0.${i}` },
  }), "bus")));
  await Promise.all(results.map((result) => result.task?.()));
  const docs = await db.collection("qr_campaigns/bus_dunkerque/hourly_stats").get();
  assert.ok(docs.size >= 1 && docs.size <= 4);
  const sum = (field: string) => docs.docs.reduce((total, doc) => total + (doc.data()[field] ?? 0), 0);
  assert.equal(sum("opens"), 40);
  assert.equal(sum("ios"), 30);
  assert.equal(sum("android"), 10);
  for (const doc of docs.docs) {
    assert.deepEqual(Object.keys(doc.data()).filter((key) => !["campaign_id", "date", "hour", "shard", "opens", "ios", "android", "updated_at"].includes(key)), []);
  }

  const stats = await routes.stats.GET(call("/api/admin/qr-campaigns/bus_dunkerque/stats?from=2026-11-30&to=2026-12-01"), ctx("bus_dunkerque"));
  assert.equal(stats.status, 200);
  const body = (await stats.json()).stats;
  assert.equal(body.totals.opens, 40);
  assert.deepEqual(body.devices, { ios: 30, android: 10, other: 0 });
  assert.deepEqual(body.daily, [{ date: "2026-11-30", opens: 0 }, { date: "2026-12-01", opens: 40 }]);
  assert.equal(body.hourly[8], 40);
  const invalid = await routes.stats.GET(call("/api/admin/qr-campaigns/bus_dunkerque/stats?from=2024-01-01&to=2026-12-01"), ctx("bus_dunkerque"));
  assert.equal(invalid.status, 400);
});
