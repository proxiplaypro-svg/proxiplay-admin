import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";

// Firestore is replaced by an in-page fake: no Firebase service is contacted.
const firestoreStub = `export const doc=(_db,...path)=>path.join('/');
export function onSnapshot(path,next,error){window.listeners.push({path,next,error});next({data:()=>window.config});return()=>{}}
export async function setDoc(path,data,options){if(window.writeError)throw Error('denied');window.writes.push({path,data,options});window.config={...(window.config||{}),...data};for(const l of window.listeners)l.next({data:()=>window.config})}`;

async function render(initialConfig, run) {
  const executablePath = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium"].find(existsSync);
  assert.ok(executablePath);
  const entry = `window.listeners=[];window.writes=[];window.config=${JSON.stringify(initialConfig)};
import React from'react';import{createRoot}from'react-dom/client';import{MerchantReferralProgramToggle}from'./components/admin/MerchantReferralProgramToggle';
createRoot(document.getElementById('root')).render(<MerchantReferralProgramToggle/>);`;
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, jsx: "automatic",
    plugins: [{ name: "isolated-firestore", setup(builder) {
      const stubs = { "firebase/firestore": firestoreStub, "@/lib/firebase/client-app": "export const db={}" };
      builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: "stub" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: stubs[args.path], loader: "js" }));
    } }] });
  const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(`<div id="root"></div><script>${bundle.outputFiles[0].text}</script>`); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage(); page.setDefaultTimeout(10000);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const click = async text => { assert.ok(await page.evaluate(text => { const b = [...document.querySelectorAll("button")].find(b => b.textContent === text); if (!b || b.disabled) return false; b.click(); return true; }, text), text); };
    await run(page, click);
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}

test("the merchant referral switch is reachable from the Parrainage section", () => {
  const playerPage = readFileSync("app/admin/parrainage/page.tsx", "utf8");
  const merchantPage = readFileSync("app/admin/parrainage-commercants/page.tsx", "utf8");
  for (const source of [playerPage, merchantPage]) assert.match(source, /<MerchantReferralProgramToggle \/>/);
  // Shown at the top of the merchant page, above the referrals table.
  assert.ok(merchantPage.indexOf("<MerchantReferralProgramToggle />") < merchantPage.indexOf("<table"));
  assert.match(merchantPage, /50 € en bons cadeaux \(jamais en espèces\)/);
  assert.match(merchantPage, /Confirmer le 1er abonnement payé/);
  assert.doesNotMatch(merchantPage, /100 €/);
  const sidebar = readFileSync("components/admin/Sidebar.tsx", "utf8");
  assert.match(sidebar, /href: "\/admin\/parrainage", label: "Parrainage joueurs"[\s\S]{0,120}href: "\/admin\/parrainage-commercants"/);
});

test("disabling then enabling writes app_config/merchant_referral", async () => {
  await render({ enabled: true }, async (page, click) => {
    await page.waitForFunction(() => document.body.textContent.includes("Programme activé"));
    await click("Désactiver le programme");
    await page.waitForFunction(() => document.body.textContent.includes("Programme désactivé"));
    await click("Activer le programme");
    await page.waitForFunction(() => document.body.textContent.includes("Programme activé"));
    assert.deepEqual(await page.evaluate(() => window.writes), [
      { path: "app_config/merchant_referral", data: { enabled: false }, options: { merge: true } },
      { path: "app_config/merchant_referral", data: { enabled: true }, options: { merge: true } },
    ]);
  });
});

test("a missing setting can be initialised and a failed write is reported", async () => {
  await render(null, async (page, click) => {
    await page.waitForFunction(() => document.body.textContent.includes("Réglage non initialisé"));
    await click("Activer le programme");
    await page.waitForFunction(() => !document.body.textContent.includes("Réglage non initialisé"));
    await page.evaluate(() => { window.writeError = true; });
    await click("Désactiver le programme");
    await page.waitForFunction(() => document.body.textContent.includes("Impossible de modifier le programme de parrainage."));
    assert.deepEqual(await page.evaluate(() => window.writes.map(w => w.data)), [{ enabled: true }]);
  });
});
