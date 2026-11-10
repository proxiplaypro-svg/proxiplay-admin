import assert from "node:assert/strict";
import test from "node:test";
import {
  QR_STATS_SHARDS,
  aggregateQrStats,
  automatedQrRequestReason,
  classifyQrDevice,
  formatParisDateTimeInput,
  isQrCampaignLive,
  isValidQrCampaignId,
  listDayKeys,
  parisHourBucket,
  parseParisDateTimeInput,
  qrCounterIncrements,
  qrPublicUrl,
  qrStatsDocId,
  validateQrDestination,
  validateQrSlug,
} from "@/lib/admin/qrCampaigns";

export const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

test("identifiants et chemins : format, chemins réservés", () => {
  assert.equal(isValidQrCampaignId("bus_dunkerque"), true);
  for (const bad of ["Bus", "bu", "bus-dunkerque", "_bus", "bus_", "a".repeat(41), ""]) assert.equal(isValidQrCampaignId(bad), false, bad);
  assert.equal(validateQrSlug("bus"), null);
  assert.equal(validateQrSlug("flyer-2027"), null);
  for (const bad of ["Bus", "-bus", "bus-", "bus/x", "bus x", "", "a".repeat(41)]) assert.match(validateQrSlug(bad) ?? "", /Chemin invalide/, bad);
  for (const reserved of ["joueurs", "academie", "j", "c", "espace-commercant", "api", "legal"]) {
    assert.match(validateQrSlug(reserved) ?? "", /réservé/, reserved);
  }
});

test("destinations : https et domaines autorisés seulement (pas de redirection ouverte)", () => {
  for (const ok of ["https://onelink.to/jx4ee7", "https://apps.apple.com/fr/app/proxiplay/id6753818573",
    "https://play.google.com/store/apps/details?id=com.proxiplay.proxiplay", "https://www.proxiplay.fr/joueurs/"]) {
    assert.equal(validateQrDestination(ok), null, ok);
  }
  for (const bad of ["http://onelink.to/jx4ee7", "https://onelink.to.evil.example/x", "https://evil.example/onelink.to",
    "javascript:alert(1)", "https://user:pass@onelink.to/x", "https://onelink.to:8443/x", "//onelink.to/x", "", "x".repeat(501)]) {
    assert.notEqual(validateQrDestination(bad), null, bad);
  }
});

test("URL publique stable : chemin court pour bus, /c/ pour les autres", () => {
  assert.equal(qrPublicUrl("bus"), "https://proxiplay.fr/bus");
  assert.equal(qrPublicUrl("flyer-2027"), "https://proxiplay.fr/c/flyer-2027");
});

test("appareil estimé : iPhone, iPad, Android, autres", () => {
  assert.equal(classifyQrDevice(UA.iphone), "ios");
  assert.equal(classifyQrDevice(UA.ipad), "ios");
  assert.equal(classifyQrDevice(UA.android), "android");
  assert.equal(classifyQrDevice(UA.samsung), "android");
  assert.equal(classifyQrDevice(UA.desktop), "other");
  assert.equal(classifyQrDevice(null), "other");
});

test("robots, aperçus et préchargements écartés ; vrais navigateurs comptés", () => {
  const base = { method: "GET", userAgent: UA.iphone };
  assert.equal(automatedQrRequestReason(base), null);
  assert.equal(automatedQrRequestReason({ ...base, userAgent: UA.android }), null);
  assert.equal(automatedQrRequestReason({ ...base, method: "HEAD" }), "head");
  assert.equal(automatedQrRequestReason({ ...base, userAgent: "" }), "missing_agent");
  for (const bot of ["Googlebot/2.1 (+http://www.google.com/bot.html)", "facebookexternalhit/1.1", "WhatsApp/2.23.20.0",
    "Mozilla/5.0 (compatible; bingbot/2.0)", "Slackbot-LinkExpanding 1.0", "TelegramBot (like TwitterBot)", "curl/8.4.0",
    "python-requests/2.31", "Mozilla/5.0 HeadlessChrome/120.0", "okhttp/4.12.0"]) {
    assert.equal(automatedQrRequestReason({ ...base, userAgent: bot }), "bot", bot);
  }
  assert.equal(automatedQrRequestReason({ ...base, secPurpose: "prefetch;prerender" }), "prefetch");
  assert.equal(automatedQrRequestReason({ ...base, purpose: "prefetch" }), "prefetch");
  assert.equal(automatedQrRequestReason({ ...base, xMoz: "prefetch" }), "prefetch");
});

test("heure de Paris, changements d'heure compris", () => {
  assert.deepEqual(parisHourBucket(new Date("2026-11-10T07:15:00Z")), { date: "2026-11-10", hour: 8 });
  assert.deepEqual(parisHourBucket(new Date("2026-07-01T22:30:00Z")), { date: "2026-07-02", hour: 0 });
  // Passage a l'heure d'ete le 29/03/2026 : 01:30 UTC = 03:30 a Paris.
  assert.deepEqual(parisHourBucket(new Date("2026-03-29T01:30:00Z")), { date: "2026-03-29", hour: 3 });
  // Retour a l'heure d'hiver le 25/10/2026 : 02h a Paris deux fois.
  assert.deepEqual(parisHourBucket(new Date("2026-10-25T00:30:00Z")), { date: "2026-10-25", hour: 2 });
  assert.deepEqual(parisHourBucket(new Date("2026-10-25T01:30:00Z")), { date: "2026-10-25", hour: 2 });
  assert.equal(qrStatsDocId("2026-11-10", 8, 3), "2026-11-10_08_3");
});

test("date de lancement saisie en heure de Paris", () => {
  assert.equal(parseParisDateTimeInput("2026-12-01T08:00")?.toISOString(), "2026-12-01T07:00:00.000Z");
  assert.equal(parseParisDateTimeInput("2026-07-01T08:00")?.toISOString(), "2026-07-01T06:00:00.000Z");
  for (const bad of ["2026-02-30T08:00", "2026-12-01 08:00", "2026-12-01T24:00", "", null]) assert.equal(parseParisDateTimeInput(bad), null);
  assert.equal(formatParisDateTimeInput(new Date("2026-12-01T07:00:00Z")), "2026-12-01T08:00");
  assert.equal(formatParisDateTimeInput(null), "");
});

test("ouverture comptée seulement si la campagne est active et lancée", () => {
  const now = new Date("2026-12-01T10:00:00Z");
  assert.equal(isQrCampaignLive("active", null, now), true);
  assert.equal(isQrCampaignLive("active", new Date("2026-12-01T09:00:00Z"), now), true);
  assert.equal(isQrCampaignLive("active", new Date("2026-12-02T09:00:00Z"), now), false);
  for (const status of ["draft", "paused", "archived"] as const) assert.equal(isQrCampaignLive(status, null, now), false);
  assert.deepEqual(qrCounterIncrements({ automated: false, live: true, device: "ios", fallback: false }), { opens: 1, ios: 1 });
  assert.deepEqual(qrCounterIncrements({ automated: false, live: false, device: "ios", fallback: false }), { outside_campaign: 1 });
  assert.deepEqual(qrCounterIncrements({ automated: true, live: true, device: "android", fallback: true }), { excluded_automated: 1, fallback_redirects: 1 });
});

test("agrégation : répartitions additionnées, période respectée, jours vides à zéro", () => {
  const docs = [
    { date: "2026-12-01", hour: 8, opens: 3, ios: 2, android: 1, excluded_automated: 1 },
    { date: "2026-12-01", hour: 8, opens: 2, android: 2 },
    { date: "2026-12-01", hour: 18, opens: 1, other: 1, fallback_redirects: 1 },
    { date: "2026-12-03", hour: 7, opens: 4, ios: 4, outside_campaign: 2 },
    { date: "2026-11-30", hour: 8, opens: 99, ios: 99 }, // hors periode
    { date: "2026-12-02", hour: 99, opens: -5, ios: "x" }, // invalide
  ];
  const stats = aggregateQrStats(docs, "2026-12-01", "2026-12-03");
  assert.ok(stats);
  assert.equal(stats.totals.opens, 10);
  assert.deepEqual(stats.devices, { ios: 6, android: 3, other: 1 });
  assert.equal(stats.totals.excluded_automated, 1);
  assert.equal(stats.totals.outside_campaign, 2);
  assert.equal(stats.totals.fallback_redirects, 1);
  assert.deepEqual(stats.daily, [{ date: "2026-12-01", opens: 6 }, { date: "2026-12-02", opens: 0 }, { date: "2026-12-03", opens: 4 }]);
  assert.equal(stats.hourly[8], 5);
  assert.equal(stats.hourly[18], 1);
  assert.equal(stats.hourly[7], 4);
  assert.equal(stats.hourly.reduce((a, b) => a + b, 0), 10);
});

test("périodes : bornes comprises, 366 jours au plus", () => {
  assert.equal(listDayKeys("2026-12-30", "2027-01-02")?.length, 4);
  assert.equal(listDayKeys("2026-01-01", "2026-12-31")?.length, 365);
  assert.equal(listDayKeys("2025-01-01", "2026-12-31"), null);
  assert.equal(listDayKeys("2026-12-03", "2026-12-01"), null);
  assert.equal(listDayKeys("2026-02-30", "2026-03-01"), null);
  assert.equal(QR_STATS_SHARDS, 4);
});

test("Preview : la base de production n'est jamais utilisée pour les campagnes QR", async () => {
  const { resolveQrDatabaseTarget, QrDatabaseUnavailableError } = await import("@/lib/qr/qrDb");
  // Production (et tests locaux) : base de l'Admin.
  assert.deepEqual(resolveQrDatabaseTarget({ VERCEL_ENV: "production" }), { kind: "admin" });
  assert.deepEqual(resolveQrDatabaseTarget({}), { kind: "admin" });
  // Preview sans base de test, meme avec les identifiants FIREBASE_* herites : refus.
  assert.throws(() => resolveQrDatabaseTarget({ VERCEL_ENV: "preview", FIREBASE_PROJECT_ID: "proxi-play-odzp2e" }), QrDatabaseUnavailableError);
  // Preview pointee sur la production : refus.
  assert.throws(() => resolveQrDatabaseTarget({ VERCEL_ENV: "preview", QR_FIREBASE_PROJECT_ID: "proxi-play-odzp2e",
    QR_FIREBASE_CLIENT_EMAIL: "x@y", QR_FIREBASE_PRIVATE_KEY: "k" }), QrDatabaseUnavailableError);
  // Preview avec base de test complete : base isolee.
  const isolated = resolveQrDatabaseTarget({ VERCEL_ENV: "preview", QR_FIREBASE_PROJECT_ID: "proxiplay-qr-preview",
    QR_FIREBASE_CLIENT_EMAIL: "qr@proxiplay-qr-preview.iam.gserviceaccount.com", QR_FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----" });
  assert.equal(isolated.kind, "isolated");
  assert.ok(isolated.kind === "isolated" && isolated.privateKey.includes("\nabc\n"));
  assert.throws(() => resolveQrDatabaseTarget({ VERCEL_ENV: "preview", QR_FIREBASE_PROJECT_ID: "proxiplay-qr-preview" }), QrDatabaseUnavailableError);
});
