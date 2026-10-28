import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";

test("page simple : recherche, emails manquants avec Stop, sélection et message confirmé", async () => {
  const executablePath = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium", "/usr/bin/google-chrome"].find(existsSync);
  assert.ok(executablePath, "CHROME_PATH required");
  const email = address => [{ email: address, is_primary: true, type: "general", source_url: "https://boutique.fr", discovered_at: "2026-10-01T10:00:00Z" }];
  const prospects = [
    { id: "a", name: "Avec email A", emails: email("a@boutique.fr") },
    { id: "b", name: "Avec email B", emails: email("b@boutique.fr") },
    { id: "optout", name: "Désinscrit", emails: email("c@boutique.fr"), do_not_contact: true, unsubscribed_at: "2026-10-02T10:00:00Z" },
    { id: "done", name: "Déjà contacté", emails: email("d@boutique.fr"), proposal: { id: "x", revision: 1, to: "d@boutique.fr", subject: "S", body: "B", status: "sent", sent_at: "2026-10-03T10:00:00Z" } },
    { id: "nf", name: "Sans email", email_enrichment_status: "not_found" },
    ...Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, name: `Manquant ${i}`, ...(i === 0 ? { email_enrichment_status: "failed" } : {}) })),
  ].map(p => ({ status: "new", category: "restaurants", city: "Dunkerque", created_at: "2026-10-01T10:00:00Z", source: "google", ...p }));
  const requests = []; let releaseEnrich;
  const fixture = `import React from 'react'; import {createRoot} from 'react-dom/client'; import Page from './app/admin/prospection/page';
    window.fixtureCall=async input=>{const r=await fetch('/mock',{method:'POST',body:JSON.stringify(input)});const d=await r.json();if(!r.ok)throw new Error(d.error);return d};
    createRoot(document.getElementById('root')).render(<Page/>);`;
  const output = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, jsx: "automatic", outfile: "fixture.js", plugins: [{ name: "local-only", setup(b) {
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "mock" }));
    b.onResolve({ filter: /prospection\/(emailClient|client)$/ }, args => ({ path: args.path.endsWith("emailClient") ? "email" : "client", namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.path === "link" ? 'import React from "react"; export default function Link({children,...props}){return React.createElement("a",props,children)}' : args.path === "email" ? 'export const emailRequest = input => window.fixtureCall(input)' : 'export const prospectRequest = (method, body) => window.fixtureCall(body || {action:"list"})', loader: "js", resolveDir: process.cwd() }));
  } }] });
  const js = output.outputFiles.find(f => f.path.endsWith(".js")).text;
  const css = output.outputFiles.find(f => f.path.endsWith(".css"))?.text || "";
  const server = createServer(async (req, res) => {
    if (req.url === "/mock") {
      let raw = ""; for await (const part of req) raw += part;
      const input = JSON.parse(raw); requests.push(input); let result = { prospects, ignored: [], searchAvailable: true };
      if (input.action === "search") result = { results: [{ name: "Nouveau resto", city: "Dunkerque", google_place_id: "p1", duplicate: null }, { name: "Connu", city: "Dunkerque", google_place_id: "p2", duplicate: { kind: "prospect", id: "a", name: "Connu", reason: "place" } }], excludedCount: 3 };
      if (input.action === "import") { prospects.push({ id: "new", name: "Nouveau resto", city: "Dunkerque", status: "new", created_at: "2026-10-04T10:00:00Z", source: "google" }); result = { created: ["new"], skipped: [] }; }
      if (input.action === "enrich_batch") { await new Promise(resolve => { releaseEnrich = resolve; }); for (const id of input.ids) Object.assign(prospects.find(p => p.id === id), { email_enrichment_status: "found", emails: email(`${id}@trouve.fr`) }); result = { found: input.ids.length, not_found: 0, failed: 0, emails: input.ids.length }; }
      if (input.action === "batch_template") result = { subject: "Objet du modèle", body: "Corps du modèle\n\nPascal" };
      if (input.action === "batch_current") result = { batch: null };
      if (input.action === "batch_prepare") result = { batch: { id: input.batchId, confirmed: false, identity: { from: "ProxiPlay <contact@proxiplay.fr>", replyTo: "contact@proxiplay.fr" }, items: input.ids.map(id => ({ id, name: id, to: `${id}@x.fr`, subject: input.subject, body: input.body, state: "ready" })) } };
      res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(result)); return;
    }
    res.setHeader("Content-Type", req.url === "/fixture.js" ? "text/javascript" : "text/html; charset=utf-8");
    res.end(req.url === "/fixture.js" ? js : `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{font-family:Arial;margin:0;padding:16px}${css}</style><div id="root"></div><script src="/fixture.js"></script></html>`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true }); const page = await browser.newPage();
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.setRequestInterception(true); page.on("request", r => r.url().startsWith(base) ? r.continue() : r.abort());
    await page.setViewport({ width: 390, height: 844 }); await page.goto(base);
    const text = () => page.$eval("body", el => el.textContent);
    const click = async label => { await page.waitForFunction(t => [...document.querySelectorAll("button")].some(b => b.textContent === t && !b.disabled), {}, label); await page.evaluate(t => [...document.querySelectorAll("button")].find(b => b.textContent === t).click(), label); };
    await page.waitForSelector('[data-prospect-id="a"]');
    assert.match(await text(), /2 entreprise\(s\) avec email exploitable/);
    assert.equal(await page.$eval('[data-prospect-id="optout"] input', el => el.disabled), true);
    assert.equal(await page.$eval('[data-prospect-id="done"] input', el => el.disabled), true);
    assert.match(await page.$eval('[data-prospect-id="optout"]', el => el.textContent), /Ne pas contacter \(désinscrit\)/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "pas de défilement horizontal sur mobile");

    await page.select("select", "bars/cafés"); await click("Rechercher des entreprises");
    await page.waitForFunction(() => document.body.textContent.includes("1 nouvelle(s) entreprise(s) trouvée(s) · 3 déjà connue(s) écartée(s)"));
    assert.deepEqual(requests.find(r => r.action === "search"), { action: "search", location: "Dunkerque", radius: 15, categories: ["bars/cafés"], limit: 50, onlyNew: true });
    await click("Ajouter les 1 entreprise(s)");
    await page.waitForSelector('[data-prospect-id="new"]');
    assert.deepEqual(requests.find(r => r.action === "import").selection.map(r => r.name), ["Nouveau resto"]);

    // 7 manquants + la nouvelle entreprise ; "Aucun email public trouvé" n'est pas relancé.
    await click("Trouver les emails manquants (8)");
    while (!releaseEnrich) await new Promise(r => setTimeout(r, 20));
    await click("Stop"); const release = releaseEnrich; releaseEnrich = null; release();
    await page.waitForFunction(() => document.body.textContent.includes("arrêté"));
    const enrich = requests.filter(r => r.action === "enrich_batch");
    assert.equal(enrich.length, 1); assert.deepEqual(enrich[0].ids, ["m0", "m1", "m2"]);
    assert.match(await text(), /3 \/ 8 entreprises analysées · 3 avec email/);
    await page.waitForFunction(() => document.body.textContent.includes("5 entreprise(s) avec email exploitable"));
    assert.ok(!enrich.flatMap(r => r.ids).includes("nf"));

    await click("Cocher les entreprises avec email"); assert.match(await text(), /5 cochée\(s\)/);
    await page.click('[data-prospect-id="m2"] input'); assert.match(await text(), /4 cochée\(s\)/);
    await click("Envoyer un email"); await page.waitForSelector('section[aria-label="Email"] textarea');
    assert.equal(await page.$eval('section[aria-label="Email"] input', el => el.value), "Objet du modèle");
    await page.$eval('section[aria-label="Email"] input', el => { el.select(); });
    await page.type('section[aria-label="Email"] input', "Objet confirmé");
    await page.$eval('section[aria-label="Email"] textarea', el => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
    await page.keyboard.type("\nPS : merci");
    await click("Préparer les 4 emails");
    await page.waitForSelector('section[aria-label="Envoi groupé"]');
    const prepared = requests.find(r => r.action === "batch_prepare");
    assert.deepEqual(prepared.ids, ["a", "b", "m0", "m1"]); assert.equal(prepared.subject, "Objet confirmé"); assert.equal(prepared.body, "Corps du modèle\n\nPascal\nPS : merci");
    assert.equal(requests.some(r => r.action === "batch_confirm" || r.action === "batch_step"), false, "aucun envoi sans confirmation explicite");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
