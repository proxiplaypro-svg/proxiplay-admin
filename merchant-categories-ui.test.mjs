import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";

const fixture = `import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import CommerceFields,{emptyCommerce} from './components/admin/commercants/CommerceFields';
window.loadCategories=()=>new Promise((resolve,reject)=>{window.resolveCategories=resolve;window.rejectCategories=reject});
function Fixture(){const [value,setValue]=useState({...emptyCommerce,name:'USDK',category:['historique','inactive']});return <form onSubmit={e=>{e.preventDefault();window.saved=value.category}}><CommerceFields value={value} onChange={(key,next)=>setValue(current=>({...current,[key]:next}))}/><output>{JSON.stringify(value.category)}</output><button>Enregistrer</button></form>}
createRoot(document.getElementById('root')).render(<Fixture/>);`;

test("real selector: loading, retry, labels, multiple selection, removal, legacy, inactive and empty", async () => {
  const executablePath = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium"].find(existsSync);
  assert.ok(executablePath);
  const output = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, jsx: "automatic", plugins: [{ name: "isolated-categories", setup(builder) {
    builder.onResolve({ filter: /merchantMediaClient$/ }, () => ({ path: "media", namespace: "media-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "media-fixture" }, () => ({ contents: "export const merchantMediaRequest=async()=>({results:[]})" }));
    builder.onResolve({ filter: /merchantCategoriesClient$/ }, () => ({ path: "client", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const fetchMerchantCategories=()=>window.loadCategories()" }));
  } }] });
  const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(`<div id="root"></div><script>${output.outputFiles[0].text}</script>`); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => console.error('Fixture error:', error.message));
    page.setDefaultTimeout(10000);
    await page.setRequestInterception(true);
    page.on('request', request => request.url().startsWith('http://127.0.0.1:') ? request.continue() : request.abort());
    const url = `http://127.0.0.1:${server.address().port}`;
    const click = async text => { const clicked = await page.evaluate(text => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text); b?.click(); return !!b; }, text); assert.ok(clicked, text); };
    const values = () => page.$eval('output', el => JSON.parse(el.textContent));
    const options = [{value:'beaute',label:'Beauté & bien-être',active:true},{value:'Loisirs, sport & culture',label:'Loisirs, sport & culture',active:true},{value:'inactive',label:'Retirée',active:false}];
    await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(()=>!!window.rejectCategories);
    assert.match(await page.$eval('form',el=>el.textContent),/Chargement des catégories/);
    await page.evaluate(()=>window.rejectCategories(new Error('network')));
    await page.waitForSelector('[role="alert"]');
    assert.deepEqual(await values(),['historique','inactive']);
    await page.evaluate(()=>{window.resolveCategories=null});
    await click('Réessayer'); await page.waitForFunction(()=>!!window.resolveCategories);
    await page.evaluate(options=>window.resolveCategories(options),options);
    await page.waitForFunction(()=>document.body.textContent.includes('+ Ajouter'));
    assert.equal(await page.$$eval('small',els=>els.filter(e=>e.textContent.includes('ancienne catégorie')).length),2);
    await click('+ Ajouter une catégorie');
    assert.equal(await page.$$eval('input[type="checkbox"]',els=>els.length),2);
    await page.click('input[type="checkbox"]');
    await page.click('input[type="checkbox"]:not(:checked)');
    assert.deepEqual(await values(),['historique','inactive','beaute','Loisirs, sport & culture']);
    await page.type('input[type="search"]','beaute');
    assert.equal(await page.$$eval('input[type="checkbox"]',els=>els.length),1);
    assert.equal(await page.$eval('input[type="checkbox"]',el=>el.checked),true);
    await page.click('button[aria-label="Retirer Beauté & bien-être"]');
    assert.equal(await page.$eval('input[type="checkbox"]',el=>el.checked),false);
    await page.click('button[aria-label="Retirer Retirée"]');
    await click('Enregistrer');
    assert.deepEqual(await page.evaluate(()=>window.saved),['historique','Loisirs, sport & culture']);
    assert.equal(await page.$$eval('fieldset input:not([type="checkbox"]):not([type="search"])',els=>els.length),0);
    assert.ok(!(await page.$eval('form',el=>el.textContent)).includes('séparées par des virgules'));
    await page.reload(); await page.waitForFunction(()=>!!window.resolveCategories);
    await page.evaluate(()=>window.resolveCategories([]));
    await page.waitForFunction(()=>document.body.textContent.includes('Aucune catégorie disponible.'));
    assert.equal(await page.$$eval('fieldset input',els=>els.length),0);
    assert.deepEqual(await values(),['historique','inactive']);
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
});
