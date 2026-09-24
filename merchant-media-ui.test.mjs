import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const mediaStub = `export async function merchantMediaRequest(path,body){window.calls.push({path,body});if(path==='google'){if(window.googleError)throw Error('Google indisponible');return {results:window.results}}return {photos:window.gallery||[],version:'v1'}}
export async function uploadMerchantGallery(id,form,progress){window.uploads.push({id,operation:form.get('operation'),manifest:JSON.parse(form.get('manifest'))});progress(50);if(window.uploadError)throw Error('Transfert interrompu');return {photos:JSON.parse(form.get('manifest')).map((p,i)=>({id:String(i),url:'https://example.test/'+i})),version:'v2'}}`;
const boot = `window.calls=[];window.uploads=[];window.created=0;window.results=[1,2].map(i=>({name:'USDK '+i,google_place_id:'place-'+i,address:'28 rue du Stade',postal_code:'59140',city:'Dunkerque',phone:'0328000000',website:'https://example.test/',google_rating:4.5,google_user_rating_count:42}));`;
async function browserFixture(contents, run) {
  const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync);
  assert.ok(executablePath);
  const bundle = await build({ stdin: { contents: boot + contents, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, jsx: 'automatic', plugins: [{name:'isolated-media',setup(builder){
    const stubs = { merchantMediaClient:mediaStub, merchantCategoriesClient:"export const fetchMerchantCategories=async()=>[]", merchantClient:"export class MerchantRequestError extends Error{};export async function merchantRequest(){window.created++;return {merchantId:'created-id'}}", 'firebase/auth':"export async function sendPasswordResetEmail(){}", '@/lib/firebase/auth':"export const auth={}", 'next/navigation':"export const useRouter=()=>({push:path=>window.destination=path})", 'next/link':"import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}" };
    builder.onResolve({filter:/.*/},args=>{const key=Object.hasOwn(stubs,args.path)?args.path:Object.keys(stubs).find(key=>args.path.endsWith('/'+key));return key?{path:key,namespace:'stub'}:undefined});
    builder.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'js',resolveDir:process.cwd()}));
  }}] });
  const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<div id="root"></div><script>${bundle.outputFiles[0].text}</script>`)});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
    const page=await browser.newPage();page.setDefaultTimeout(10000);
    await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith('http://127.0.0.1:')||r.url().startsWith('blob:')?r.continue():r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const click=async text=>{assert.ok(await page.evaluate(text=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text);if(!button||button.disabled)return false;button.click();return true},text),text)};
    await run(page,click);
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
async function addFiles(page,formats=['jpeg','png','webp']) {
  const files=await Promise.all(formats.map(async format=>({type:`image/${format}`,bytes:[...await sharp({create:{width:2000,height:1000,channels:3,background:'blue'}}).toFormat(format).toBuffer()]})));
  await page.evaluate(files=>{const transfer=new DataTransfer();for(const [index,file]of files.entries())transfer.items.add(new File([new Uint8Array(file.bytes)],`photo${index}`,{type:file.type}));const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))},files);
  await page.waitForFunction(()=>document.body.textContent.includes('Photos prêtes'));
}
test('Google UI: explicit choice, preserve fields, change/remove, manual Enter, empty and failure',async()=>{
  await browserFixture(`import React,{useState}from'react';import{createRoot}from'react-dom/client';import CommerceFields,{emptyCommerce}from'./components/admin/commercants/CommerceFields';function App(){const[value,setValue]=useState({...emptyCommerce,name:'USDK',city:'Dunkerque',address:'Adresse manuelle'});return <form onSubmit={e=>{e.preventDefault();window.submitted=true}}><CommerceFields value={value} onChange={(key,next)=>setValue(current=>({...current,[key]:next}))}/><output>{JSON.stringify(value)}</output></form>}createRoot(document.getElementById('root')).render(<App/>);`,async(page,click)=>{
    const value=()=>page.$eval('output',el=>JSON.parse(el.textContent));
    await click('Trouver sur Google');await page.waitForFunction(()=>document.body.textContent.includes('Sélectionner USDK 2'));
    assert.equal((await value()).google_place_id,'');assert.deepEqual(await page.evaluate(()=>window.calls[0].body),{name:'USDK',location:'Dunkerque'});
    await click('Sélectionner USDK 1');await page.waitForFunction(()=>document.querySelector('code')?.textContent==='place-1');
    assert.deepEqual(Object.fromEntries(Object.entries(await value()).filter(([k])=>['address','area_code','city','phone','site_web_url'].includes(k))),{address:'Adresse manuelle',area_code:'59140',city:'Dunkerque',phone:'0328000000',site_web_url:'https://example.test/'});
    await click('Changer');await page.waitForFunction(()=>document.body.textContent.includes('Sélectionner USDK 2'));await click('Sélectionner USDK 2');await page.waitForFunction(()=>document.querySelector('code')?.textContent==='place-2');
    await click('Supprimer l’association Google');assert.equal((await value()).google_place_id,'');assert.equal((await value()).address,'Adresse manuelle');
    await page.evaluate(()=>window.results=[]);await click('Trouver sur Google');await page.waitForFunction(()=>document.body.textContent.includes('Aucun établissement'));
    await page.focus('fieldset input[maxlength="200"]');await page.keyboard.press('Enter');await page.waitForFunction(()=>window.calls.length===4);assert.equal(await page.evaluate(()=>window.submitted),undefined);
    await page.evaluate(()=>window.googleError=true);await click('Rechercher sur Google');await page.waitForFunction(()=>document.body.textContent.includes('Google indisponible'));
  });
});
test('Photos UI: local JPEG/PNG/WebP optimization, primary/remove, abandon without upload',async()=>{
  await browserFixture(`import React from'react';import{createRoot}from'react-dom/client';import Photos from'./components/admin/commercants/MerchantPhotos';import{useMerchantPhotos}from'./components/admin/commercants/useMerchantPhotos';function App(){const state=useMerchantPhotos();window.state=state;return <Photos state={state}/>}createRoot(document.getElementById('root')).render(<App/>);`,async(page,click)=>{
    await addFiles(page);assert.equal(await page.$$eval('img',els=>els.length),3);
    assert.deepEqual(await page.evaluate(()=>window.state.photos.map(p=>p.file.type)),['image/webp','image/webp','image/webp']);
    assert.ok(await page.evaluate(()=>window.state.photos.every(p=>p.file.size<=650*1024)));
    const second=await page.evaluate(()=>window.state.photos[1].id);await click('Définir principale');assert.equal(await page.evaluate(()=>window.state.photos[0].id),second);
    await page.click('button[aria-label="Supprimer la photo 2"]');assert.equal(await page.$$eval('img',els=>els.length),2);
    await page.evaluate(async()=>{await window.state.add([new File(['x'],'invalid.svg',{type:'image/svg+xml'})])});await page.waitForSelector('[role="alert"]');
    await page.evaluate(async()=>{await window.state.add([new File([new Uint8Array(13*1024*1024)],'big.jpeg',{type:'image/jpeg'})])});assert.match(await page.$eval('[role="alert"]',e=>e.textContent),/12/);
    assert.equal(await page.evaluate(()=>window.uploads.length),0);assert.equal(await page.evaluate(()=>window.calls.length),0);
    await page.reload();assert.equal(await page.$$eval('img',els=>els.length),0);assert.equal(await page.evaluate(()=>window.uploads.length),0);
  });
});
test('Creation UI: upload only after merchant creation, retry photo failure without duplicate merchant',async()=>{
  await browserFixture(`import React from'react';import{createRoot}from'react-dom/client';import Page from'./app/admin/marchands/nouveau/page';createRoot(document.getElementById('root')).render(<Page/>);`,async(page,click)=>{
    await page.type('input[required]','USDK');await page.select('select','shop');await addFiles(page,['png']);
    assert.equal(await page.evaluate(()=>window.uploads.length),0);await page.evaluate(()=>window.uploadError=true);
    await click('Créer uniquement la fiche');await page.waitForFunction(()=>document.body.textContent.includes('Réessayer l’enregistrement des photos'));
    assert.equal(await page.evaluate(()=>window.created),1);assert.equal(await page.evaluate(()=>window.uploads[0].id),'created-id');
    await page.evaluate(()=>window.uploadError=false);await click('Réessayer l’enregistrement des photos');await page.waitForFunction(()=>window.destination==='/admin/commercants/created-id');
    assert.equal(await page.evaluate(()=>window.created),1);assert.equal(await page.evaluate(()=>window.uploads.length),2);assert.equal(await page.evaluate(()=>window.uploads[0].operation===window.uploads[1].operation),true);
  });
});
test('Existing gallery UI: load, choose primary, save retained IDs, photo limit and server failure',async()=>{
  await browserFixture(`import React from'react';import{createRoot}from'react-dom/client';import Photos from'./components/admin/commercants/MerchantPhotos';import{useMerchantPhotos}from'./components/admin/commercants/useMerchantPhotos';window.gallery=[{id:'old-a',url:'https://example.test/a'},{id:'old-b',url:'https://example.test/b'}];function App(){const state=useMerchantPhotos('existing');window.state=state;return <><Photos state={state}/><button disabled={state.busy||!state.dirty} onClick={()=>state.save('existing').catch(()=>{})}>Enregistrer</button></>}createRoot(document.getElementById('root')).render(<App/>);`,async(page,click)=>{
    await page.waitForFunction(()=>document.querySelectorAll('img').length===2);
    await click('Définir principale');await page.evaluate(()=>window.uploadError=true);await click('Enregistrer');await page.waitForSelector('[role="alert"]');
    assert.equal(await page.evaluate(()=>window.state.dirty),true);assert.equal(await page.evaluate(()=>window.state.photos[0].id),'old-b');
    await page.evaluate(()=>window.uploadError=false);await click('Enregistrer');await page.waitForFunction(()=>!window.state.dirty);
    assert.deepEqual(await page.evaluate(()=>window.uploads[1].manifest),[{id:'old-b'},{id:'old-a'}]);
    await addFiles(page);assert.equal(await page.$eval('input[type=file]',e=>e.disabled),true);
    await page.evaluate(async()=>window.state.add([new File(['x'],'six.png',{type:'image/png'})]));await page.waitForFunction(()=>document.body.textContent.includes('5 photos maximum par commerce'));
    assert.equal(await page.evaluate(()=>window.state.photos.length),5);
  });
});
test('Quick editor points to shared gallery and cannot overwrite the primary photo',async()=>{
  await browserFixture(`import React from'react';import{createRoot}from'react-dom/client';import{MerchantEditModal}from'./components/admin/commercants/MerchantEditModal';createRoot(document.getElementById('root')).render(<MerchantEditModal merchant={{id:'existing',name:'USDK',imageUrl:'https://example.test/primary',category:[]}} open={true} saving={false} feedback={null} onClose={()=>{}} onSave={async payload=>{window.saved=payload}}/>);`,async(page,click)=>{
    assert.equal(await page.$$eval('input[type=file]',els=>els.length),0);
    assert.equal(await page.$eval('a',el=>el.getAttribute('href')),'/admin/commercants/existing/edit');
    await click('Enregistrer');await page.waitForFunction(()=>!!window.saved);
    assert.equal(await page.evaluate(()=>Object.hasOwn(window.saved,'imageUrl')),false);
    assert.equal(await page.evaluate(()=>Object.hasOwn(window.saved,'imageFile')),false);
  });
});
