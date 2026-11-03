import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";

// merchantRequest simulé : enregistre chaque appel, renvoie le compte courant
// (window.account) mis à jour comme le ferait le serveur.
const clientStub = `export async function merchantRequest(method,body,id){window.calls.push({method,body:body?JSON.parse(JSON.stringify(body)):body});
if(method==='GET')return {account:window.account};
if(body.action==='access')window.account={...window.account,loginAllowed:body.loginAllowed};
if(body.action==='update')window.account={...window.account,first_name:body.first_name,last_name:body.last_name,account_phone:body.account_phone,email:body.email};
return {account:window.account}}`;
const account = (validation) => ({ uid: "u1", email: "m@example.test", first_name: "Camille", last_name: "Martin", account_phone: "0600000000", loginAllowed: true, role: "commercant", validation });

async function render(initialAccount, run) {
  const executablePath = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium"].find(existsSync);
  assert.ok(executablePath);
  const contents = `window.calls=[];window.account=${JSON.stringify(initialAccount)};import React from'react';import{createRoot}from'react-dom/client';import MerchantAccount from'./components/admin/commercants/MerchantAccount';createRoot(document.getElementById('root')).render(React.createElement(MerchantAccount,{merchantId:'shop-1'}));`;
  const bundle = await build({ stdin: { contents, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, jsx: "automatic", plugins: [{ name: "isolated-account", setup(builder) {
    const stubs = { merchantClient: clientStub, "firebase/auth": "export async function sendPasswordResetEmail(){}", "@/lib/firebase/auth": "export const auth={}" };
    builder.onResolve({ filter: /.*/ }, args => { const key = Object.hasOwn(stubs, args.path) ? args.path : Object.keys(stubs).find(k => args.path.endsWith("/" + k)); return key ? { path: key, namespace: "stub" } : undefined; });
    builder.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: stubs[args.path], loader: "js", resolveDir: process.cwd() }));
  } }] });
  const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(`<div id="root"></div><script>${bundle.outputFiles[0].text}</script>`); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage(); page.setDefaultTimeout(10000);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => document.body.textContent.includes("Validation :"));
    const click = async text => { assert.ok(await page.evaluate(text => { const b = [...document.querySelectorAll("button")].find(b => b.textContent === text); if (!b || b.disabled) return false; b.click(); return true; }, text), text); };
    const lastPatch = () => page.evaluate(() => window.calls.filter(c => c.method === "PATCH").at(-1)?.body);
    await run(page, click, lastPatch);
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}

test("fiche compte : validation et connexion affichées séparément ; l'enregistrement n'envoie que l'identité", async () => {
  await render(account({ status: "approved", label: "Validé", legacy: false }), async (page, click, lastPatch) => {
    assert.match(await page.evaluate(() => document.body.textContent), /Validation : Validé · Connexion : autorisée/);
    assert.equal(await page.$("input[type=checkbox]:not([required])"), null, "plus de case « compte actif » dans le formulaire d'identité");
    const firstName = (await page.$$("fieldset input"))[1];
    await firstName.click({ clickCount: 3 }); await firstName.type("Léa");
    await click("Enregistrer le compte");
    await page.waitForFunction(() => document.body.textContent.includes("Compte commerçant enregistré."));
    const body = await lastPatch();
    assert.deepEqual(Object.keys(body).sort(), ["account_phone", "action", "email", "expectedOwner", "first_name", "last_name"]);
    assert.equal(body.action, "update"); assert.equal(body.first_name, "Léa");
    assert.match(await page.evaluate(() => document.body.textContent), /Connexion : autorisée/);
  });
});

test("fiche compte : seule l'action explicite modifie la connexion", async () => {
  await render(account({ status: "approved", label: "Validé", legacy: false }), async (page, click, lastPatch) => {
    await click("Désactiver la connexion");
    await page.waitForFunction(() => document.body.textContent.includes("Connexion désactivée."));
    assert.deepEqual(await lastPatch(), { loginAllowed: false, action: "access", expectedOwner: "u1" });
    assert.match(await page.evaluate(() => document.body.textContent), /Validation : Validé · Connexion : désactivée/);
    await click("Autoriser la connexion");
    await page.waitForFunction(() => document.body.textContent.includes("Connexion autorisée."));
    assert.deepEqual(await lastPatch(), { loginAllowed: true, action: "access", expectedOwner: "u1" });
  });
});

test("fiche compte : ancien statut signalé à régulariser, jamais renvoyé", async () => {
  await render(account({ status: "inactive", label: "Statut à régulariser (ancien : inactive)", legacy: true }), async (page, click, lastPatch) => {
    const text = await page.evaluate(() => document.body.textContent);
    assert.match(text, /Statut à régulariser \(ancien : inactive\)/);
    assert.match(text, /conservé tel quel/);
    await click("Enregistrer le compte");
    await page.waitForFunction(() => document.body.textContent.includes("Compte commerçant enregistré."));
    const body = await lastPatch();
    for (const key of ["validation", "loginAllowed", "active", "account_status"]) assert.equal(key in body, false, key);
  });
});
