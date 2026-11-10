import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_APP_DESTINATION } from "@/lib/admin/qrCampaigns";
import { createQrRedirectHandler, type QrHourlyIncrement, type QrRedirectStore, type QrRedirectTarget } from "@/lib/qr/qrRedirect";

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36",
};
const BUS: QrRedirectTarget = { campaignId: "bus_dunkerque", destination: "https://onelink.to/jx4ee7", status: "active", launchAt: null };

function fakeStore(targets: Record<string, QrRedirectTarget | null>) {
  const writes: QrHourlyIncrement[] = [];
  const state = { reads: 0, readDelayMs: 0, readError: false, writeError: false, writeDelayMs: 0 };
  const store: QrRedirectStore = {
    async findBySlug(slug) {
      state.reads += 1;
      if (state.readDelayMs) await new Promise((resolve) => setTimeout(resolve, state.readDelayMs));
      if (state.readError) throw new Error("UNAVAILABLE");
      return targets[slug] ?? null;
    },
    async increment(update) {
      if (state.writeDelayMs) await new Promise((resolve) => setTimeout(resolve, state.writeDelayMs));
      if (state.writeError) throw new Error("UNAVAILABLE");
      writes.push(update);
    },
  };
  return { store, writes, state, targets };
}

function request(ua: string | null, init: { method?: string; ip?: string; headers?: Record<string, string> } = {}) {
  return new Request("https://admin.proxiplay.fr/api/public/qr/bus", {
    method: init.method ?? "GET",
    headers: { ...(ua === null ? {} : { "user-agent": ua }), ...(init.ip ? { "x-forwarded-for": `${init.ip}, 76.76.21.21` } : {}), ...init.headers },
  });
}

function setup(targets: Record<string, QrRedirectTarget | null> = { bus: BUS }, extra: Partial<Parameters<typeof createQrRedirectHandler>[0]> = {}) {
  const fake = fakeStore(targets);
  const logs: string[] = [];
  let clock = new Date("2026-12-01T07:15:00Z").getTime();
  const handler = createQrRedirectHandler({
    store: fake.store, now: () => new Date(clock), random: () => 0.6, resolveTimeoutMs: 50, writeTimeoutMs: 50,
    log: (message) => logs.push(message), ...extra,
  });
  return { ...fake, handler, logs, advance: (ms: number) => { clock += ms; } };
}

test("iPhone : 302 immédiat vers OneLink, sans cache, comptage seulement après la réponse", async () => {
  const { handler, writes } = setup();
  const result = await handler.handle(request(UA.iphone, { ip: "10.0.0.1" }), "bus");
  assert.equal(result.response.status, 302);
  assert.equal(result.response.headers.get("location"), "https://onelink.to/jx4ee7");
  assert.equal(result.response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(result.outcome, "counted");
  assert.equal(writes.length, 0, "aucune écriture avant l'envoi de la réponse");
  await result.task?.();
  assert.deepEqual(writes, [{
    campaignId: "bus_dunkerque", docId: "2026-12-01_08_2", date: "2026-12-01", hour: 8, shard: 2,
    increments: { opens: 1, ios: 1 },
  }]);
  // Ni adresse IP, ni navigateur dans ce qui est enregistre.
  assert.doesNotMatch(JSON.stringify(writes), /10\.0\.0\.1|Mozilla|iPhone/);
});

test("Android et autres appareils : même redirection, appareil estimé", async () => {
  const { handler, writes } = setup();
  for (const [ua, ip] of [[UA.android, "10.0.0.2"], [UA.desktop, "10.0.0.3"]] as const) {
    const result = await handler.handle(request(ua, { ip }), "bus");
    assert.equal(result.response.headers.get("location"), "https://onelink.to/jx4ee7");
    await result.task?.();
  }
  assert.deepEqual(writes.map((write) => write.increments), [{ opens: 1, android: 1 }, { opens: 1, other: 1 }]);
});

test("écriture Firestore en échec ou trop lente : l'utilisateur est redirigé, l'erreur est seulement journalisée", async () => {
  const { handler, state, logs, writes } = setup();
  state.writeError = true;
  const failed = await handler.handle(request(UA.iphone, { ip: "10.0.1.1" }), "bus");
  assert.equal(failed.response.status, 302);
  await assert.doesNotReject(failed.task!());
  state.writeError = false;
  state.writeDelayMs = 200;
  const slow = await handler.handle(request(UA.iphone, { ip: "10.0.1.2" }), "bus");
  assert.equal(slow.response.status, 302);
  await assert.doesNotReject(slow.task!());
  assert.equal(writes.length, 0);
  assert.equal(logs.length, 2);
  assert.doesNotMatch(logs.join(" "), /10\.0\.1|Mozilla/);
});

test("lecture lente sans cache (instance froide) : lien de secours immédiat, comptage différé après la réponse", async () => {
  const { handler, state, writes } = setup();
  state.readDelayMs = 300;
  const started = Date.now();
  const result = await handler.handle(request(UA.iphone, { ip: "10.0.2.1" }), "bus");
  assert.ok(Date.now() - started < 250, "la redirection n'attend pas Firestore");
  assert.equal(result.response.headers.get("location"), DEFAULT_APP_DESTINATION);
  assert.equal(result.fallback, true);
  assert.equal(result.outcome, "deferred");
  assert.equal(writes.length, 0);
  await result.task?.();
  // Compte une fois la lecture terminee, repli signale.
  assert.deepEqual(writes.map((write) => [write.campaignId, write.increments]),
    [["bus_dunkerque", { opens: 1, ios: 1, fallback_redirects: 1 }]]);
});

test("lecture en panne sans cache : lien de secours immédiat, rien à compter", async () => {
  const { handler, state, writes } = setup();
  state.readError = true;
  const result = await handler.handle(request(UA.iphone, { ip: "10.0.2.2" }), "bus");
  assert.equal(result.response.headers.get("location"), DEFAULT_APP_DESTINATION);
  assert.equal(result.outcome, "uncounted");
  assert.equal(result.task, null);
  assert.equal(writes.length, 0);
});

test("lecture lente partagée : une seule lecture, toutes les requêtes en attente sont comptées", async () => {
  const { handler, state, writes } = setup();
  state.readDelayMs = 200;
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
    handler.handle(request(i % 2 ? UA.android : UA.iphone, { ip: `10.0.2.${10 + i}` }), "bus")));
  assert.ok(results.every((result) => result.outcome === "deferred"));
  await Promise.all(results.map((result) => result.task?.()));
  assert.equal(state.reads, 1);
  assert.equal(writes.length, 5);
  assert.equal(writes.filter((write) => write.increments.android).length, 2);
});

test("panne après une première lecture : dernière destination connue, redirection de secours comptée", async () => {
  const { handler, state, writes, advance } = setup(
    { bus: { ...BUS, destination: "https://apps.apple.com/fr/app/proxiplay/id6753818573" } },
    { cacheTtlMs: 1000 },
  );
  await (await handler.handle(request(UA.iphone, { ip: "10.0.3.1" }), "bus")).task?.();
  advance(2000);
  state.readError = true;
  const result = await handler.handle(request(UA.iphone, { ip: "10.0.3.2" }), "bus");
  assert.equal(result.response.headers.get("location"), "https://apps.apple.com/fr/app/proxiplay/id6753818573");
  await result.task?.();
  assert.deepEqual(writes.at(-1)?.increments, { opens: 1, ios: 1, fallback_redirects: 1 });
});

test("destination modifiée : même URL, nouvelle destination dès l'expiration du cache (60 s)", async () => {
  const { handler, targets, advance, state } = setup();
  assert.equal((await handler.handle(request(UA.iphone), "bus")).response.headers.get("location"), "https://onelink.to/jx4ee7");
  targets.bus = { ...BUS, destination: "https://play.google.com/store/apps/details?id=com.proxiplay.proxiplay" };
  advance(30_000);
  assert.equal((await handler.handle(request(UA.iphone), "bus")).response.headers.get("location"), "https://onelink.to/jx4ee7");
  advance(31_000);
  assert.equal((await handler.handle(request(UA.iphone), "bus")).response.headers.get("location"),
    "https://play.google.com/store/apps/details?id=com.proxiplay.proxiplay");
  assert.equal(state.reads, 2, "une lecture par minute et par instance");
});

test("destination enregistrée invalide : jamais suivie, repli constant sur le lien de téléchargement", async () => {
  const { handler, writes, state } = setup({ bus: { ...BUS, destination: "https://evil.example/" } });
  for (const ip of ["10.0.6.1", "10.0.6.2", "10.0.6.3"]) {
    const result = await handler.handle(request(UA.iphone, { ip }), "bus");
    assert.equal(result.response.headers.get("location"), DEFAULT_APP_DESTINATION, ip);
    await result.task?.();
  }
  assert.equal(state.reads, 1);
  assert.deepEqual(writes.map((write) => write.increments), Array(3).fill({ outside_campaign: 1, fallback_redirects: 1 }));
});

test("lecture lente : seule la première requête attend le délai, puis la lecture terminée remplit le cache", async () => {
  const { handler, state } = setup();
  state.readDelayMs = 300;
  const first = Date.now();
  await handler.handle(request(UA.iphone), "bus");
  assert.ok(Date.now() - first >= 40);
  const second = Date.now();
  const result = await handler.handle(request(UA.iphone), "bus");
  assert.ok(Date.now() - second < 30, "repli immédiat");
  assert.equal(result.response.headers.get("location"), DEFAULT_APP_DESTINATION);
  assert.equal(state.reads, 1, "lecture partagée");
  await result.task?.();
  const recovered = await handler.handle(request(UA.iphone), "bus");
  assert.equal(recovered.fallback, false);
  assert.equal(recovered.response.headers.get("location"), "https://onelink.to/jx4ee7");
  assert.equal(state.reads, 1, "destination servie depuis le cache rempli par la lecture lente");
});

test("lecture en échec : repli immédiat pendant 10 s, puis nouvelle lecture", async () => {
  const { handler, state, advance } = setup();
  state.readError = true;
  await handler.handle(request(UA.iphone), "bus");
  await handler.handle(request(UA.iphone), "bus");
  assert.equal(state.reads, 1, "aucune nouvelle lecture pendant 10 s");
  state.readError = false;
  advance(11_000);
  const recovered = await handler.handle(request(UA.iphone), "bus");
  assert.equal(recovered.fallback, false);
  assert.equal(state.reads, 2);
});

test("chemin inconnu ou invalide : accueil du site, aucun comptage", async () => {
  const { handler, state } = setup();
  for (const slug of ["inconnu", "../admin", "BUS%2F", ""]) {
    const result = await handler.handle(request(UA.iphone), slug);
    assert.equal(result.response.status, 302);
    assert.equal(result.response.headers.get("location"), "https://www.proxiplay.fr/");
    assert.equal(result.task, null);
  }
  assert.equal(state.reads, 1, "seul le chemin bien formé est lu");
});

test("robots, aperçus et préchargements : redirigés, comptés à part ; HEAD : jamais compté", async () => {
  const { handler, writes } = setup();
  for (const req of [request("facebookexternalhit/1.1"), request("WhatsApp/2.23"), request(UA.iphone, { headers: { "sec-purpose": "prefetch" } }), request(null)]) {
    const result = await handler.handle(req, "bus");
    assert.equal(result.response.headers.get("location"), "https://onelink.to/jx4ee7");
    assert.equal(result.outcome, "automated");
    await result.task?.();
  }
  const head = await handler.handle(request(UA.iphone, { method: "HEAD" }), "bus");
  assert.equal(head.response.status, 302);
  assert.equal(head.task, null);
  assert.deepEqual(writes.map((write) => write.increments), Array(4).fill({ excluded_automated: 1 }));
});

test("rafale : une même origine n'est comptée qu'une fois par 30 s (mémoire seulement)", async () => {
  const { handler, writes, advance } = setup();
  const run = async (ip?: string) => { const result = await handler.handle(request(UA.iphone, { ip }), "bus"); await result.task?.(); return result; };
  assert.equal((await run("10.0.4.1")).outcome, "counted");
  assert.equal((await run("10.0.4.1")).outcome, "burst");
  assert.equal((await run("10.0.4.2")).outcome, "counted");
  advance(31_000);
  assert.equal((await run("10.0.4.1")).outcome, "counted");
  // Sans adresse transmise, aucune deduplication.
  assert.equal((await run()).outcome, "counted");
  assert.equal((await run()).outcome, "counted");
  assert.equal(writes.length, 5);
});

test("campagne à préparer, en pause ou avant son lancement : redirigée, comptée hors période", async () => {
  for (const target of [{ ...BUS, status: "draft" as const }, { ...BUS, status: "paused" as const },
    { ...BUS, launchAt: new Date("2026-12-02T07:00:00Z") }]) {
    const { handler, writes } = setup({ bus: target });
    const result = await handler.handle(request(UA.iphone), "bus");
    assert.equal(result.response.headers.get("location"), "https://onelink.to/jx4ee7");
    assert.equal(result.outcome, "outside_campaign");
    await result.task?.();
    assert.deepEqual(writes[0].increments, { outside_campaign: 1 });
  }
});

test("plafond d'écritures par instance et par jour : redirection maintenue, comptage suspendu", async () => {
  const { handler, writes, advance } = setup({ bus: BUS }, { dailyWriteCap: 2 });
  const outcomes = [];
  for (let i = 0; i < 4; i++) {
    const result = await handler.handle(request(UA.iphone, { ip: `10.0.5.${i}` }), "bus");
    assert.equal(result.response.status, 302);
    outcomes.push(result.outcome);
    await result.task?.();
  }
  assert.deepEqual(outcomes, ["counted", "counted", "capped", "capped"]);
  advance(24 * 3600_000);
  assert.equal((await handler.handle(request(UA.iphone, { ip: "10.0.5.9" }), "bus")).outcome, "counted");
  assert.equal(writes.length, 2);
});

test("la route publique confie le comptage à after() et ne l'attend jamais", () => {
  const source = readFileSync("app/api/public/qr/[slug]/route.ts", "utf8");
  assert.match(source, /import \{ after \} from "next\/server"/);
  assert.match(source, /if \(result\.task\) after\(result\.task\);/);
  assert.doesNotMatch(source, /await (result\.)?task/);
  // Reglages de verification (delai, en-tetes de diagnostic) inactifs en production.
  assert.match(source, /const debugHeaders = !isProduction && process\.env\.QR_DEBUG_HEADERS === "1";/);
  assert.match(source, /resolveTimeoutMs: isProduction \? 500 :/);
  assert.match(source, /export const HEAD = redirect;/);
  assert.match(source, /export const dynamic = "force-dynamic";/);
});

test("protection contre les rafales désactivable (fenêtre 0)", async () => {
  const { handler, writes } = setup({ bus: BUS }, { burstWindowMs: 0 });
  for (let i = 0; i < 3; i++) await (await handler.handle(request(UA.iphone, { ip: "10.0.7.1" }), "bus")).task?.();
  assert.equal(writes.length, 3);
  const route = readFileSync("app/api/public/qr/[slug]/route.ts", "utf8");
  assert.match(route, /process\.env\.QR_BURST_WINDOW_MS/);
});
