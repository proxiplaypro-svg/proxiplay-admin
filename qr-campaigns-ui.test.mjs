import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";

const stats = {
  from: "2026-12-01", to: "2026-12-03",
  totals: { opens: 10, ios: 6, android: 3, other: 1, excluded_automated: 4, outside_campaign: 2, fallback_redirects: 1 },
  daily: [{ date: "2026-12-01", opens: 6 }, { date: "2026-12-02", opens: 0 }, { date: "2026-12-03", opens: 4 }],
  hourly: Array.from({ length: 24 }, (_, hour) => (hour === 8 ? 7 : hour === 18 ? 3 : 0)),
  devices: { ios: 6, android: 3, other: 1 },
};

async function render(run) {
  const executablePath = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium"].find(existsSync);
  assert.ok(executablePath);
  const entry = `import React from'react';import{createRoot}from'react-dom/client';import{QrStatsPanel}from'./components/admin/qr/QrStatsPanel';
createRoot(document.getElementById('root')).render(<QrStatsPanel stats={${JSON.stringify(stats)}}/>);`;
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, jsx: "automatic" });
  const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(`<div id="root"></div><script>${bundle.outputFiles[0].text}</script>`); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 900 });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForSelector("[data-testid=qr-stats]");
    await run(page);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("statistiques : chiffres clés, graphiques, appareils et rappel « ouvertures »", async () => {
  await render(async (page) => {
    const text = await page.evaluate(() => document.getElementById("root").textContent);
    for (const expected of ["Ouvertures enregistrées", "Robots et aperçus écartés", "Hors période de campagne", "Redirections de secours",
      "Ouvertures par jour", "Répartition par heure (Paris)", "Appareils estimés", "ni un téléchargement ni une installation"]) {
      assert.ok(text.includes(expected), expected);
    }
    assert.match(text, /iPhone \/ iPad6 · 60 %/);
    assert.match(text, /Android3 · 30 %/);
    assert.match(text, /Autres1 · 10 %/);
    assert.doesNotMatch(text, /visiteurs uniques|téléchargements :|installations :/i);
    const daily = await page.$$eval("[data-testid=qr-daily-chart] rect", (rects) => rects.map((rect) => Number(rect.getAttribute("height"))));
    assert.equal(daily.length, 3);
    assert.ok(daily[0] > daily[2] && daily[2] > 0 && daily[1] === 0);
    assert.equal(await page.$$eval("[data-testid=qr-hourly-chart] rect", (rects) => rects.length), 24);
    assert.match(await page.$eval("[data-testid=qr-daily-chart]", (svg) => svg.getAttribute("aria-label")), /01\/12 : 6, 02\/12 : 0, 03\/12 : 4/);
    // Pas de debordement horizontal sur mobile.
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  });
});
