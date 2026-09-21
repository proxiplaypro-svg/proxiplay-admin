import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";

test("bulk UI: preparation, inspection, cancellation, explicit confirmation and refresh without send", async () => {
  const requests = []; let batch = null;
  const fixture = `import React from 'react';import {createRoot} from 'react-dom/client';import {ProspectBulkEmail} from './components/admin/prospection/ProspectBulkEmail';
    window.fixtureCall=async input=>(await fetch('/mock',{method:'POST',body:JSON.stringify(input)})).json();
    createRoot(document.getElementById('root')).render(<ProspectBulkEmail ids={['one','two','none']} emailCount={2} disabled={false}/>);`;
  const output = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, jsx: "automatic", outfile: "fixture.js", plugins: [{ name: "mock", setup(b) {
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "mock" }));
    b.onResolve({ filter: /prospection\/emailClient$/ }, () => ({ path: "email", namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, a => ({ contents: a.path === "link" ? 'import React from "react";export default ({children,...props})=>React.createElement("a",props,children)' : 'export const emailRequest=input=>window.fixtureCall(input)', loader: "js", resolveDir: process.cwd() }));
  } }] });
  const js = output.outputFiles.find(f => f.path.endsWith('.js')).text;
  const css = output.outputFiles.find(f => f.path.endsWith('.css')).text;
  const server = createServer(async (req, res) => {
    if (req.url === '/mock') {
      let raw = ''; for await (const c of req) raw += c; const input = JSON.parse(raw); requests.push(input);
      if (input.action === 'batch_prepare') batch = { id: input.batchId, confirmed: false, identity: { from: 'ProxiPlay <no-reply@proxiplay.fr>', replyTo: 'contact@proxiplay.fr' }, items: ['one','two'].map(id => ({id,name:id,to:id+'@example.org',subject:'Objet '+id,body:'Message individuel '+id,state:'ready'})).concat([{id:'none',name:'Sans email',state:'excluded',reason:'Sans email primaire'}]) };
      if (input.action === 'batch_confirm') { assert.equal(input.confirmed,true); batch.confirmed = true; }
      if (input.action === 'batch_step') { assert.ok(batch.confirmed); const item = batch.items.find(i=>i.state==='ready'); if(item) item.state = 'sent'; }
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({batch,waitMs:1}));return;
    }
    res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html; charset=utf-8');
    res.end(req.url==='/fixture.js'?js:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{margin:12px}${css}</style><div id="root"></div><script src="/fixture.js"></script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); let browser;
  try {
    const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync);
    browser = await puppeteer.launch({executablePath,headless:true});const page=await browser.newPage();const base=`http://127.0.0.1:${server.address().port}`;
    await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(base)?r.continue():r.abort());
    await page.setViewport({width:390,height:844});await page.goto(base);
    const click=async text=>{await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>b.textContent===t&&!b.disabled),{},text);await page.evaluate(t=>[...document.querySelectorAll('button')].find(b=>b.textContent===t).click(),text);};
    await click('Préparer l’envoi groupé (2)');await page.waitForSelector('section[aria-label="Envoi groupé"]');
    assert.deepEqual(requests.find(r=>r.action==='batch_prepare').ids,['one','two','none']);
    assert.equal(requests.some(r=>r.action==='batch_step'),false);
    assert.match(await page.$eval('body',el=>el.textContent),/3 sélectionnés · 2 prêts à envoyer · 1 exclus/);
    await page.click('summary');assert.match(await page.$eval('details[open]',el=>el.textContent),/Message individuel one/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await click('Confirmer le lot');await click('Annuler');assert.equal(requests.some(r=>r.action==='batch_confirm'),false);
    await click('Confirmer le lot');await click('Envoyer les 2 emails');
    await page.waitForFunction(()=>document.body.textContent.includes('2 envoyés'));
    assert.equal(requests.filter(r=>r.action==='batch_confirm').length,1);assert.equal(requests.filter(r=>r.action==='batch_step').length,2);
    await page.reload();await click('Reprendre / consulter le dernier lot');
    assert.equal(requests.filter(r=>r.action==='batch_step').length,2);assert.match(await page.$eval('body',el=>el.textContent),/2 envoyés/);
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
