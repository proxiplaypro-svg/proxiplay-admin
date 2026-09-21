import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";

// Real component, isolated fake callable: this test cannot contact Firebase or SMTP.
const fixture = `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ProspectEmail} from './components/admin/prospection/ProspectEmail';
let current = {id:'prospect-demo',name:'Boutique',email:'contact@boutique.fr',proposal:null,emails:[]};
let sends=0, saves=0;
window.fixtureRequest = async input => {
  if(input.id !== 'prospect-demo') throw new Error('Wrong prospect identifier');
  if(input.action==='generate') current={...current,proposal:{id:'draft-demo',revision:1,status:'draft',to:current.email,subject:'Proxiplay',body:'Bonjour, decouvrez Proxiplay.'}};
  if(input.action==='save') { saves++; current={...current,proposal:{...current.proposal,to:input.to,subject:input.subject,body:input.body,revision:current.proposal.revision+1}}; }
  if(input.action==='send') {
    if(input.confirmed!==true || input.draftId!==current.proposal.id || input.revision!==current.proposal.revision) throw new Error('Confirmation/revision missing');
    sends++; current={...current,proposal:{...current.proposal,status:'sent'}};
  }
  if(input.action==='do_not_contact') current={...current,do_not_contact:input.value};
  document.getElementById('counts').textContent=JSON.stringify({sends,saves});
  return input.action==='send'?{status:'sent'}:{proposal:current.proposal};
};
function Fixture(){const [p,setP]=useState(current);return <ProspectEmail prospect={p} logs={[]} reload={async()=>setP({...current})} disabled={false}/>;}
createRoot(document.getElementById('root')).render(<Fixture/>);`;

test("éditeur réel : génération sans envoi, annulation, édition, confirmation unique et opposition", async () => {
  const executablePath = process.env.CHROME_PATH || [
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium", "/usr/bin/google-chrome",
  ].find(existsSync);
  assert.ok(executablePath, "Set CHROME_PATH to an installed Chromium executable");
  const output = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: "tsx" }, bundle: true,
    write: false, jsx: "automatic", outfile: "fixture.js", plugins: [{ name: "isolated-callable", setup(builder) {
      builder.onResolve({ filter: /prospection\/emailClient$/ }, () => ({ path: "fake", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const emailRequest = data => window.fixtureRequest(data);", loader: "js" }));
    } }] });
  const js = output.outputFiles.find(file => file.path.endsWith(".js")).text;
  assert.ok(!/OVH_SMTP_|nodemailer|firebaseapp\.com|cloudfunctions\.net/.test(js));
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", req.url === "/fixture.js" ? "text/javascript" : "text/html; charset=utf-8");
    res.end(req.url === "/fixture.js" ? js : '<!doctype html><html lang="fr"><meta charset="utf-8"><div id="counts">{"sends":0,"saves":0}</div><div id="root"></div><script src="/fixture.js"></script></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", request => request.url().startsWith(`http://127.0.0.1:${server.address().port}/`) ? request.continue() : request.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const click = async text => {
      await page.waitForFunction(label => [...document.querySelectorAll("button")].some(b => b.textContent === label && !b.disabled), {}, text);
      await page.evaluate(label => [...document.querySelectorAll("button")].find(b => b.textContent === label).click(), text);
    };
    const counts = async () => JSON.parse(await page.$eval("#counts", el => el.textContent));
    await click("Générer la proposition"); await page.waitForSelector('input[type="email"]');
    assert.equal((await counts()).sends, 0);
    await click("Envoyer"); await page.waitForSelector('[role="alertdialog"]');
    assert.equal((await counts()).sends, 0);
    assert.match(await page.$eval('[role="alertdialog"]', el => el.textContent), /contact@boutique.fr/);
    await click("Annuler"); assert.equal((await counts()).sends, 0);
    await page.$eval('input[type="email"]', input => { input.focus(); input.select(); });
    await page.keyboard.type("autre@boutique.fr");
    await click("Envoyer"); await page.waitForSelector('[role="alertdialog"]');
    assert.match(await page.$eval('[role="alertdialog"]', el => el.textContent), /autre@boutique.fr/);
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(b => b.textContent === "Confirmer"); b.click(); b.click(); });
    await page.waitForFunction(() => document.body.textContent.includes("Email envoyé"));
    assert.equal((await counts()).sends, 1);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent === "Envoyer").disabled), true);
    page.on("dialog", dialog => dialog.accept()); await click("Régénérer");
    await page.waitForFunction(() => document.body.textContent.includes("Brouillon — aucun envoi effectué"));
    await page.click('input[type="checkbox"]');
    await page.waitForFunction(() => [...document.querySelectorAll("button")].find(b => b.textContent === "Envoyer").disabled);
    assert.equal((await counts()).sends, 1); assert.deepEqual(errors, []);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
