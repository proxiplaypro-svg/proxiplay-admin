#!/usr/bin/env node
// Controle HTTP d'une URL de campagne QR (local, Vercel Preview ou
// production) : 302 immediat, destination, absence de cache, iPhone,
// Android, robot et HEAD. Lecture seule : n'ecrit rien, sauf les compteurs
// de la campagne visee si elle est active (une ouverture par requete GET).
//
// Usage : node scripts/check-qr-redirect.mjs <url> <destination attendue>
//   ex. node scripts/check-qr-redirect.mjs https://<preview>.vercel.app/bus https://onelink.to/jx4ee7

const AGENTS = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  robot: "facebookexternalhit/1.1",
};

export async function checkQrRedirect(url, expected, { fetchImpl = fetch } = {}) {
  const results = [];
  for (const [name, agent, method] of [["iphone", AGENTS.iphone, "GET"], ["android", AGENTS.android, "GET"],
    ["robot", AGENTS.robot, "GET"], ["head", AGENTS.iphone, "HEAD"]]) {
    const started = performance.now();
    const response = await fetchImpl(url, { method, redirect: "manual", headers: { "user-agent": agent } });
    const elapsedMs = Math.round(performance.now() - started);
    const location = response.headers.get("location");
    const cacheControl = response.headers.get("cache-control") ?? "";
    results.push({
      name, method, status: response.status, location, elapsedMs, cacheControl,
      ok: response.status === 302 && location === expected && /no-store/.test(cacheControl),
    });
  }
  return results;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/check-qr-redirect.mjs")) {
  const [url, expected] = process.argv.slice(2);
  if (!url || !expected) {
    console.error("Usage : node scripts/check-qr-redirect.mjs <url> <destination attendue>");
    process.exit(2);
  }
  const results = await checkQrRedirect(url, expected);
  for (const result of results) console.log(JSON.stringify(result));
  process.exitCode = results.every((result) => result.ok) ? 0 : 1;
}
