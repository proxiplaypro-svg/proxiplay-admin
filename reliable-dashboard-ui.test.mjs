import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import puppeteer, { KnownDevices } from "puppeteer-core";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// Interactive bars of the consolidated dashboard: hover, click, touch and
// keyboard show one tooltip at a time with the full date and the exact value,
// from the analytics_daily values already loaded.
const daily = Array.from({ length: 30 }, (_, i) => ({
  day: new Date(Date.UTC(2026, 8, 29 + i)).toISOString().slice(0, 10),
  participations: i === 29 ? 1234 : 600 + i, uniquePlayers: i === 0 ? 1 : 150 + i,
}));
const data = { ready: true, referenceDate: "2026-10-28", metrics: { registeredPlayers: 1694, newAccountsYesterday: 8, playersYesterday: 222, participationsYesterday: 862, merchantsWithActiveGame: 12, activeGames: 12 }, daily };
const NNBSP = "\u202f";

async function serve() {
  const fixture = `import React from 'react'; import {createRoot} from 'react-dom/client'; import ReliableDashboard from './components/admin/ReliableDashboard';
    createRoot(document.getElementById('root')).render(<main style={{padding:16}}><ReliableDashboard data={${JSON.stringify(data)}} /><p id="outside" style={{height:200}}>Ailleurs</p></main>);`;
  const output = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, jsx: "automatic", outfile: "fixture.js", plugins: [{ name: "mock", setup(b) {
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: 'import React from "react"; export default function Link({children,href,...props}){return React.createElement("a",{href,...props},children)}', loader: "js", resolveDir: process.cwd() }));
  } }] });
  const js = output.outputFiles.find(f => f.path.endsWith(".js")).text;
  const css = (await postcss([tailwind()]).process(readFileSync("app/globals.css", "utf8"), { from: "app/globals.css" })).css;
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", req.url === "/fixture.js" ? "text/javascript" : "text/html; charset=utf-8");
    res.end(req.url === "/fixture.js" ? js : `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><div id="root"></div><script src="/fixture.js"></script></html>`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return server;
}

async function withPage(run) {
  const server = await serve(); let browser;
  try {
    const executablePath = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium"].find(existsSync);
    browser = await puppeteer.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.setRequestInterception(true); page.on("request", r => r.url().startsWith(base) ? r.continue() : r.abort());
    await run(page, base);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}

const chart = title => `[data-chart-bars][aria-label^="${title}"]`;
const bar = (title, index) => `${chart(title)} > button:nth-of-type(${index + 1})`;
const tooltips = page => page.$$eval("[data-chart-tooltip]", items => items.map(item => ({ text: item.textContent, ...item.getBoundingClientRect().toJSON(), chart: item.closest("[data-chart-bars]").getAttribute("aria-label").split(",")[0] })));
const center = (page, selector) => page.$eval(selector, el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
async function assertInsideChart(page, tip, width) {
  const box = await page.$eval(chart(tip.chart), el => el.closest("section").getBoundingClientRect().toJSON());
  assert.ok(tip.left >= box.left - 0.5 && tip.right <= box.right + 0.5, `tooltip ${tip.left}-${tip.right} outside its chart ${box.left}-${box.right}`);
  assert.ok(tip.right <= width, "tooltip inside the screen");
}

test("desktop: hover, click, keyboard; one tooltip, full date and exact French value", async () => {
  await withPage(async (page, base) => {
    await page.setViewport({ width: 1280, height: 1000 }); await page.goto(base); await page.waitForSelector("[data-chart-bars]");
    const cards = await page.$$eval("article", items => items.map(item => item.textContent));
    assert.equal(cards.length, 6); assert.ok(cards[1].includes("Nouveaux comptes hier")); assert.ok(cards[1].includes("Le 28/10/2026")); assert.ok(cards[1].includes("8"));

    // Accessible labels on every bar, one tab stop per chart, colours unchanged.
    const buttons = await page.$$eval("[data-chart-bars] > button", items => items.map(item => ({ label: item.getAttribute("aria-label"), tab: item.tabIndex })));
    assert.equal(buttons.length, 60);
    assert.equal(buttons[29].label, "Mercredi 28 octobre 2026 : 179 joueurs uniques");
    assert.equal(buttons[0].label, "Mardi 29 septembre 2026 : 1 joueur unique");
    assert.equal(buttons[59].label, `Mercredi 28 octobre 2026 : 1${NNBSP}234 parties jouées`);
    assert.equal(buttons.filter(item => item.tab === 0).length, 2);
    assert.deepEqual(await page.$$eval("[data-chart-bar]", items => [...new Set(items.map(item => getComputedStyle(item).backgroundColor))]), ["rgb(47, 111, 237)", "rgb(99, 153, 34)"]);
    assert.equal((await tooltips(page)).length, 0);

    // Hover shows, moving to another bar replaces, leaving hides.
    let point = await center(page, bar("Joueurs quotidiens", 10)); await page.mouse.move(point.x, point.y);
    let tips = await tooltips(page);
    assert.equal(tips.length, 1); assert.equal(tips[0].text, "Vendredi 9 octobre 2026160 joueurs uniques");
    await assertInsideChart(page, tips[0], 1280);
    point = await center(page, bar("Parties quotidiennes", 29)); await page.mouse.move(point.x, point.y);
    tips = await tooltips(page);
    assert.equal(tips.length, 1, "one tooltip at a time, across both charts");
    assert.equal(tips[0].text, `Mercredi 28 octobre 2026${"1" + NNBSP + "234"} parties jouées`);
    await assertInsideChart(page, tips[0], 1280);
    point = await center(page, "#outside"); await page.mouse.move(point.x, point.y);
    assert.equal((await tooltips(page)).length, 0, "leaving the bar hides the tooltip");

    // Click shows (and stays while the pointer is on the bar); a click elsewhere hides.
    point = await center(page, bar("Joueurs quotidiens", 0)); await page.mouse.click(point.x, point.y);
    tips = await tooltips(page); assert.equal(tips.length, 1); assert.match(tips[0].text, /^Mardi 29 septembre 2026/);
    await assertInsideChart(page, tips[0], 1280);
    await page.mouse.click(5, 5);
    assert.equal((await tooltips(page)).length, 0, "click elsewhere hides");

    // Keyboard: Tab enters on the last day, arrows move, Escape hides, Tab goes to the other chart.
    await page.focus('a[href="/admin/dashboard/complet"]'); // last focusable element before the charts
    await page.keyboard.press("Tab");
    // Roving focus remembers the day last selected in this chart (the clicked first day).
    tips = await tooltips(page); assert.equal(tips.length, 1); assert.match(tips[0].text, /^Mardi 29 septembre 20261 joueur unique$/);
    await page.keyboard.press("ArrowRight");
    tips = await tooltips(page); assert.match(tips[0].text, /^Mercredi 30 septembre 2026151 joueurs uniques$/);
    await page.keyboard.press("End");
    tips = await tooltips(page); assert.match(tips[0].text, /^Mercredi 28 octobre 2026179 joueurs uniques$/);
    await page.keyboard.press("ArrowRight"); // stays on the last day
    tips = await tooltips(page); assert.match(tips[0].text, /^Mercredi 28 octobre 2026/);
    await page.keyboard.press("ArrowLeft");
    tips = await tooltips(page); assert.match(tips[0].text, /^Mardi 27 octobre 2026178 joueurs uniques$/);
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Mardi 27 octobre 2026 : 178 joueurs uniques");
    await page.keyboard.press("Home");
    tips = await tooltips(page); assert.match(tips[0].text, /^Mardi 29 septembre 2026/);
    await page.keyboard.press("ArrowLeft"); // stays on the first day
    tips = await tooltips(page); assert.match(tips[0].text, /^Mardi 29 septembre 2026/);
    await page.keyboard.press("Escape");
    assert.equal((await tooltips(page)).length, 0, "Escape hides");
    await page.keyboard.press("Tab");
    tips = await tooltips(page);
    assert.equal(tips.length, 1); assert.equal(tips[0].chart, "Parties quotidiennes");
    assert.match(tips[0].text, /^Mercredi 28 octobre 2026/, "the other chart is entered on its last day");
    await page.keyboard.press("Tab");
    assert.equal((await tooltips(page)).length, 0, "leaving the charts with Tab hides");
  });
});

test("mobile: tap shows, tap again or elsewhere hides, one tooltip, stays on screen", async () => {
  await withPage(async (page, base) => {
    await page.emulate(KnownDevices["iPhone 13"]); await page.goto(base); await page.waitForSelector("[data-chart-bars]");
    const width = page.viewport().width;
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no horizontal scroll");
    const tap = async selector => { await page.$eval(selector, el => el.scrollIntoView({ block: "center" })); const p = await center(page, selector); await page.touchscreen.tap(p.x, p.y); };

    await tap(bar("Joueurs quotidiens", 29));
    let tips = await tooltips(page);
    assert.equal(tips.length, 1); assert.equal(tips[0].text, "Mercredi 28 octobre 2026179 joueurs uniques");
    await assertInsideChart(page, tips[0], width);
    await tap(bar("Joueurs quotidiens", 29));
    assert.equal((await tooltips(page)).length, 0, "second tap on the same bar hides");

    await tap(bar("Joueurs quotidiens", 0));
    tips = await tooltips(page); assert.match(tips[0].text, /^Mardi 29 septembre 2026/);
    await assertInsideChart(page, tips[0], width);
    await tap(bar("Parties quotidiennes", 15));
    tips = await tooltips(page);
    assert.equal(tips.length, 1, "one tooltip at a time on mobile too"); assert.equal(tips[0].chart, "Parties quotidiennes");
    await assertInsideChart(page, tips[0], width);
    await tap("#outside");
    assert.equal((await tooltips(page)).length, 0, "tap elsewhere hides");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "still no horizontal scroll");
  });
});
