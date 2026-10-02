import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";

test("liste réelle : états, filtres, actions, mobile et retour après envoi simulé", async () => {
  const executablePath = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium", "/usr/bin/google-chrome"].find(existsSync);
  assert.ok(executablePath, "CHROME_PATH required");
  const makeEmail = (email, is_primary) => ({ email, is_primary, type: "general", source_url: "https://boutique.fr", discovered_at: "2026-09-21T10:00:00Z" });
  const prospects = [
    { id: "primary", name: "Boutique primaire", emails: [makeEmail("autre@boutique.fr", false), makeEmail("contact@boutique.fr", true)] },
    { id: "none", name: "Sans email", email_enrichment_status: "not_found" },
    { id: "failed", name: "Site en erreur", email_enrichment_status: "failed" },
    { id: "untouched", name: "Non recherché" },
  ].map(p => ({ status: "new", category: "Commerce", city: "Dunkerque", created_at: "2026-09-21T10:00:00Z", source: "google", ...p }));
  const requests = [];
  const fixture = `import React,{useEffect,useState} from 'react'; import {createRoot} from 'react-dom/client';
    import Page from './app/admin/prospection/page'; import {ProspectEmail} from './components/admin/prospection/ProspectEmail';
    import {notifyProspectsChanged} from './lib/prospection/list';
    window.fixtureCall=async input=>(await fetch('/mock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})).json();
    function Fixture(){const [p,setP]=useState(null);const reload=async()=>{const d=await window.fixtureCall({action:'list'});setP(d.prospects.find(p=>p.id==='primary'));};useEffect(()=>{reload()},[]);
      return <div className="test-root">{location.pathname==='/admin/prospection/primary'?p&&<ProspectEmail prospect={p} logs={[]} reload={reload} disabled={false}/>:<Page/>}</div>}
    window.fixtureRefresh=()=>notifyProspectsChanged();createRoot(document.getElementById('root')).render(<Fixture/>);`;
  const output = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, jsx: "automatic", outfile: "fixture.js", plugins: [{ name: "local-only", setup(b) {
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "mock" }));
    b.onResolve({ filter: /prospection\/(emailClient|client)$/ }, args => ({ path: args.path.endsWith("emailClient") ? "email" : "client", namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.path === "link" ? 'import React from "react"; export default function Link({children,...props}){return React.createElement("a",props,children)}' : args.path === "email" ? 'export const emailRequest = input => window.fixtureCall(input)' : 'export const prospectRequest = () => window.fixtureCall({action:"list"})', loader: "js", resolveDir: process.cwd() }));
  } }] });
  const js = output.outputFiles.find(f => f.path.endsWith(".js")).text;
  const css = output.outputFiles.find(f => f.path.endsWith(".css"))?.text || "";
  const server = createServer(async (req, res) => {
    if (req.url === "/mock") {
      let raw = ""; for await (const part of req) raw += part;
      const input = JSON.parse(raw); requests.push(input);
      const p = prospects.find(p => p.id === input.id); let result = { prospects, ignored: [], searchAvailable: false };
      if (input.action === "enrich") { p.email_enrichment_status = "found"; p.emails = [makeEmail("retrouve@boutique.fr", true)]; result = { status: "found" }; }
      if (input.action === "enrich_batch") { for (const id of input.ids) { const item = prospects.find(prospect => prospect.id === id); item.email_enrichment_status = "found"; item.emails = [makeEmail("retrouve@boutique.fr", true)]; } result = { found: input.ids.length, not_found: 0, failed: 0, emails: input.ids.length }; }
      if (input.action === "generate") { p.proposal = { id: "draft", revision: 1, to: "contact@boutique.fr", subject: "Proxiplay", body: "Bonjour", status: "draft" }; result = { proposal: p.proposal }; }
      if (input.action === "save") { p.proposal = { ...p.proposal, revision: p.proposal.revision + 1 }; result = { proposal: p.proposal }; }
      if (input.action === "send") { assert.equal(input.confirmed, true); p.status = "contacted"; p.proposal = { ...p.proposal, status: "sent", sent_at: "2026-09-21T16:22:00Z" }; result = { status: "sent" }; }
      res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(result)); return;
    }
    res.setHeader("Content-Type", req.url === "/fixture.js" ? "text/javascript" : "text/html; charset=utf-8");
    res.end(req.url === "/fixture.js" ? js : `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{font-family:Arial;margin:0}.test-root{max-width:1050px;padding:16px;margin:auto}${css}</style><div id="root"></div><script src="/fixture.js"></script></html>`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true }); const page = await browser.newPage();
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.setRequestInterception(true); page.on("request", r => r.url().startsWith(base) ? r.continue() : r.abort());
    await page.setViewport({ width: 1000, height: 1000 }); await page.goto(base);
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Recherche d’emails'));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Recherche d’emails').click());
    const row = id => `[data-prospect-id="${id}"]`;
    const click = async label => { await page.waitForFunction(t => [...document.querySelectorAll('button')].some(b => b.textContent === t && !b.disabled), {}, label); await page.evaluate(t => [...document.querySelectorAll('button')].find(b => b.textContent === t).click(), label); };
    const count = async expected => page.waitForFunction(n => document.querySelectorAll('[data-prospect-id]').length === n, {}, expected);
    const emailState = async index => page.evaluate(i => document.querySelectorAll('button[aria-pressed]')[i].click(), index);
    await count(1); assert.ok(await page.$(row('untouched')));
    assert.equal(await page.$(`${row('untouched')} a[href$="#proposition"]`), null, "Recherche d’emails ne prépare pas de message");
    for (const [index, id] of [[0,'primary'],[1,'none'],[2,'failed'],[3,'untouched']]) { await emailState(index); await count(1); assert.ok(await page.$(row(id))); }
    assert.equal(await page.$$('div[aria-label="Filtrer par état email"] button').then(items => items.length), 0);
    await emailState(2); await click('Sélectionner les prospects affichés (50 max.)'); await click('Rechercher les emails (1)'); await count(0); assert.deepEqual(requests.filter(r => r.action === 'enrich_batch').map(r => r.ids), [['failed']]);
    await click('Campagnes & suivi');
    await count(2); assert.ok(await page.$(row('primary')));
    assert.equal(await page.$eval('label select', el => el.value), 'found');
    assert.match(await page.$eval('button[aria-pressed="true"]', el => el.textContent), /Nouveaux/);
    await click('Sélectionner les prospects affichés (50 max.)'); assert.match(await page.$eval('body', el => el.textContent), /2 prospect\(s\) sélectionné\(s\)/);
    assert.equal(requests.some(r => r.action === 'batch_confirm' || r.action === 'batch_step'), false);
    await click('Préparer les 2 emails'); assert.equal(requests.some(r => r.action === 'batch_step'), false);
    await page.setViewport({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal scroll on mobile');
    await page.click(`${row('primary')} a[href$="#proposition"]`); await page.waitForSelector('#proposition');
    await page.waitForFunction(() => document.activeElement.id === 'proposition');
    assert.equal(requests.some(r => r.action === 'send'), false);
    await click('Générer la proposition'); await click('Envoyer'); await page.waitForSelector('[role="alertdialog"]'); await click('Confirmer');
    await page.waitForFunction(() => document.body.textContent.includes('Email envoyé'));
    await page.goto(base); await count(4);
    assert.match(await page.$eval(row('primary'), el => el.textContent), /Contacté.*Email envoyé.*21\/09\/2026/s);
    assert.equal(requests.filter(r => r.action === 'send').length, 1);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
