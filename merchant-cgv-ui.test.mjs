import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";

// Fiche commerçant : la ligne CGV affichée selon la réponse de l'API (client stubé).
async function renderAccount(account) {
  const executablePath = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium", "/opt/pw-browsers/chromium"].find(existsSync);
  assert.ok(executablePath, "Chrome introuvable : définir CHROME_PATH");
  const stubs = {
    merchantClient: `export async function merchantRequest(){return {account:${JSON.stringify(account)}}}`,
    "firebase/auth": "export async function sendPasswordResetEmail(){}",
    "@/lib/firebase/auth": "export const auth={}",
  };
  const bundle = await build({
    stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import MerchantAccount from'./components/admin/commercants/MerchantAccount';createRoot(document.getElementById('root')).render(<MerchantAccount merchantId='m1'/>);", resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, jsx: "automatic",
    plugins: [{ name: "stubs", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => { const key = Object.hasOwn(stubs, args.path) ? args.path : Object.keys(stubs).find(k => args.path.endsWith("/" + k)); return key ? { path: key, namespace: "stub" } : undefined; });
      builder.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: stubs[args.path], loader: "js", resolveDir: process.cwd() }));
    } }],
  });
  const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(`<div id="root"></div><script>${bundle.outputFiles[0].text}</script>`); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage(); page.setDefaultTimeout(10000);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForSelector("[data-testid=merchant-cgv-status]");
    return await page.$eval("[data-testid=merchant-cgv-status]", el => el.textContent);
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
const base = { uid: "u1", email: "commerce@example.test", first_name: "", last_name: "", account_phone: "", active: true, role: "commercant" };

test("fiche : CGV acceptées avec version, date et heure", async () => {
  assert.equal(await renderAccount({ ...base, cgvAcceptedVersion: "2.1", cgvAcceptedAt: "2026-12-01T09:05:00.000Z" }), "CGV v2.1 acceptées le 01/12/2026 à 10:05");
});
test("fiche : CGV non acceptées", async () => {
  assert.equal(await renderAccount({ ...base, cgvAcceptedVersion: null, cgvAcceptedAt: null }), "CGV non acceptées");
});
