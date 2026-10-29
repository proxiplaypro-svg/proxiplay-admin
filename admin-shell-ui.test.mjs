import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// Regressions found on the production dashboard (29/10/2026), rendered with the
// real admin layout, Sidebar, ReliableDashboard and globals.css compiled by Tailwind:
// - the desktop grid column is 220px but the Sidebar was 280px wide (width of
//   the mobile drawer): the menu covered the first 60px of every admin page;
// - the chart bars had a percentage height inside an auto-height column: 0px;
// - at 390px the 30 chart columns overflowed their card.
const daily = Array.from({ length: 30 }, (_, i) => ({
  day: new Date(Date.UTC(2026, 8, 29 + i)).toISOString().slice(0, 10),
  participations: 500 + i * 10, uniquePlayers: i === 29 ? 300 : 150,
}));
const data = { ready: true, referenceDate: "2026-10-28", metrics: { registeredPlayers: 1694, playersYesterday: 222, participationsYesterday: 862, merchantsWithActiveGame: 12, activeGames: 12 }, daily };

async function serve() {
  const fixture = `import React from 'react'; import {createRoot} from 'react-dom/client'; import Layout from './app/admin/layout'; import ReliableDashboard from './components/admin/ReliableDashboard';
    createRoot(document.getElementById('root')).render(<Layout><ReliableDashboard data={${JSON.stringify(data)}} /></Layout>);`;
  const mocks = {
    "next/link": 'import React from "react"; export default function Link({children,href,...props}){return React.createElement("a",{href,...props},children)}',
    "next/navigation": 'export const useRouter=()=>({replace(){}}); export const usePathname=()=>"/admin/dashboard";',
    "firebase/auth": "export const signOut=async()=>{};",
    auth: "export const auth={};",
    useAdminAuth: 'export const useAdminAuth=()=>({loading:false,isAdmin:true,user:{email:"admin@proxiplay.fr",uid:"admin"}});',
    dashboardQueries: "export const getSidebarBadgeCounts=async()=>({gamesToFix:0,merchantsWithoutGame:0});",
  };
  const output = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, jsx: "automatic", outfile: "fixture.js", plugins: [{ name: "mock", setup(b) {
    b.onResolve({ filter: /^(next\/link|next\/navigation|firebase\/auth)$/ }, a => ({ path: a.path, namespace: "mock" }));
    b.onResolve({ filter: /lib\/firebase\/(auth|useAdminAuth|dashboardQueries)$/ }, a => ({ path: a.path.split("/").pop(), namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, a => ({ contents: mocks[a.path], loader: "js", resolveDir: process.cwd() }));
  } }] });
  const js = output.outputFiles.find(f => f.path.endsWith(".js")).text;
  // The real stylesheet: globals.css compiled by Tailwind from the current sources.
  const css = (await postcss([tailwind()]).process(readFileSync("app/globals.css", "utf8"), { from: "app/globals.css" })).css;
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", req.url === "/fixture.js" ? "text/javascript" : "text/html; charset=utf-8");
    res.end(req.url === "/fixture.js" ? js : `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><div id="root"></div><script src="/fixture.js"></script></html>`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return server;
}

test("admin shell and dashboard: no overlap, visible bars, no overflow, from 390px to 1920px", async () => {
  const server = await serve(); let browser;
  try {
    const executablePath = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium"].find(existsSync);
    browser = await puppeteer.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.setRequestInterception(true); page.on("request", r => r.url().startsWith(base) ? r.continue() : r.abort());
    const box = selector => page.$eval(selector, el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height, visible: getComputedStyle(el).display !== "none" && r.width > 0 }; });
    const open = async width => { await page.setViewport({ width, height: 900 }); await page.goto(base); await page.waitForSelector("h1"); };
    const checkDashboard = async width => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px: horizontal scroll`);
      const charts = await page.$$eval("section:has(> h2)", sections => sections.map(s => { const r = s.getBoundingClientRect(); return { right: r.right, scrollWidth: s.scrollWidth, clientWidth: s.clientWidth }; }));
      assert.equal(charts.length, 2);
      for (const chart of charts) {
        assert.ok(chart.right <= width + 0.5, `${width}px: chart card ends at ${chart.right}px`);
        assert.ok(chart.scrollWidth <= chart.clientWidth, `${width}px: chart content overflows its card`);
      }
      const bars = await page.$$eval("[data-chart-bar]", items => items.map(item => item.getBoundingClientRect().height));
      assert.equal(bars.length, 60);
      assert.ok(bars.every(h => h > 0), `${width}px: every bar is visible`);
      // Players: 29 days at 150, the last at 300 = maximum, so full height vs about half.
      assert.ok(bars[29] > bars[0] * 1.8 && bars[29] < bars[0] * 2.2, `${width}px: bar heights proportional (${bars[0]} / ${bars[29]})`);
      const link = await page.$eval('a[href="/admin/dashboard/complet"] span', el => getComputedStyle(el).color);
      assert.equal(link, "rgb(59, 109, 17)", "link keeps its green colour");
    };

    for (const width of [1024, 1280, 1920]) {
      await open(width);
      const menu = await box('.admin-desktop-sidebar aside[aria-label="Menu principal"]');
      const column = await box(".admin-desktop-sidebar");
      const title = await box("h1"); const card = await box("article");
      assert.ok(menu.right <= column.right + 0.5, `${width}px: menu ${menu.right}px exceeds its column ${column.right}px`);
      assert.ok(title.left >= menu.right, `${width}px: title starts at ${title.left}px under the menu (${menu.right}px)`);
      assert.ok(card.left >= menu.right, `${width}px: first card starts at ${card.left}px under the menu`);
      await checkDashboard(width);
    }

    for (const width of [390, 768]) {
      await open(width);
      assert.equal((await box(".admin-desktop-sidebar")).visible, false, `${width}px: desktop menu hidden`);
      const title = await box("h1");
      assert.ok(title.left >= 0 && title.left < 40, `${width}px: content uses the full width (title at ${title.left}px)`);
      await checkDashboard(width);
      await page.click('button[aria-label="Ouvrir le menu"]');
      const drawer = await box('.admin-mobile-menu-panel aside[aria-label="Menu principal"]');
      assert.ok(drawer.width >= 240 && drawer.right <= width, `${width}px: drawer ${drawer.width}px wide, inside the screen`);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector(".admin-mobile-menu"));
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
