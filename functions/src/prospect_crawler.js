const dns = require("node:dns").promises;
const http = require("node:http");
const https = require("node:https");
const { isIP } = require("node:net");

const MAX_PAGES = 5;
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 6000;
const domain = (host) => host.toLowerCase().replace(/^www\./, "");
function publicIPv4(address) {
  if (isIP(address) !== 4) return false; // IPv6 is deliberately fail-closed in V1.
  const [a, b, c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) || address === "168.63.129.16");
}
function safeTarget(value, allowedDomain) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (url.port && !["80", "443"].includes(url.port)) ||
      !url.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname) ||
      (isIP(url.hostname) && !publicIPv4(url.hostname)) ||
      (allowedDomain && domain(url.hostname) !== allowedDomain)) throw new Error("UNSAFE_DESTINATION");
  url.hash = "";
  return url;
}
async function resolvePublic(host, lookup = dns.lookup) {
  const addresses = await lookup(host, { all: true, verbatim: true, family: 4 });
  if (!addresses.length || addresses.some(({ address }) => !publicIPv4(address))) throw new Error("UNSAFE_DESTINATION");
  return addresses[0];
}
// The validated address is pinned into the actual socket lookup; redirects are never automatic.
function fetchPage(url, { lookup = dns.lookup, timeout = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let req; let expired = false;
    const timer = setTimeout(() => { expired = true; req?.destroy(); reject(new Error("TIMEOUT")); }, timeout);
    const finish = (error, result) => { clearTimeout(timer); if (error) reject(error); else resolve(result); };
    resolvePublic(url.hostname, lookup).then(({ address, family }) => {
      // DNS resolution itself shares the wall-clock deadline.
      if (expired) return;
      req = (url.protocol === "https:" ? https : http).get(url, {
        agent: false,
        lookup: (_host, options, callback) => options.all ? callback(null, [{ address, family }]) : callback(null, address, family),
        headers: { "User-Agent": "Proxiplay-Contact/1.2", Accept: "text/html", "Accept-Encoding": "identity" },
      }, (res) => {
        const status = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status)) { res.destroy(); finish(null, { redirect: res.headers.location }); return; }
        if (status !== 200 || !/text\/html|application\/xhtml\+xml/i.test(res.headers["content-type"] || "") ||
            (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") || Number(res.headers["content-length"]) > MAX_BYTES) {
          res.destroy(); finish(new Error("SITE_INACCESSIBLE")); return;
        }
        const chunks = []; let bytes = 0;
        res.on("data", (chunk) => { bytes += chunk.length; if (bytes > MAX_BYTES) { res.destroy(); finish(new Error("PAGE_TOO_LARGE")); } else chunks.push(chunk); });
        res.on("end", () => finish(null, { html: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", () => finish(new Error("SITE_INACCESSIBLE")));
      });
      req.on("error", () => finish(new Error("SITE_INACCESSIBLE")));
    }).catch((error) => finish(error));
  });
}
function decode(value) {
  return value.replace(/&#(x[0-9a-f]+|\d+);?/gi, (_, n) => {
    const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
    return code <= 0x10ffff ? String.fromCodePoint(code) : "";
  }).replace(/&commat;/gi, "@").replace(/&period;/gi, ".").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"');
}
const validEmail = (value) => typeof value === "string" && value.length <= 254 && /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value);
function emailType(email) {
  const local = email.split("@")[0];
  if (/^(contact|info|bonjour|hello|accueil|office)$/.test(local)) return "general";
  if (/^(direction|directeur|gerant|management)$/.test(local)) return "direction";
  if (/^(commercial|commerciaux|sales|partenariat|partenariats)$/.test(local)) return "commercial";
  // No name or identity is inferred from an address.
  return "other";
}
function extract(html, url, now) {
  const content = decode(html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, ""));
  const found = new Map();
  for (const match of content.matchAll(/(?<![a-z0-9.!#$%&'*+/=?^_`{|}~-])[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,63}/gi)) {
    const email = match[0].toLowerCase(); const host = email.split("@")[1];
    if (!validEmail(email) || /\.(png|jpg|jpeg|svg|webp|gif)$/i.test(email) ||
        /^(example|exemple|test|noreply|no-reply)@/.test(email) || /(?:^|\.)(example\.(com|org|net)|example|test|invalid)$/.test(host)) continue;
    // Third-party site builders, legal firms, etc. are not assumed to belong to the prospect.
    if (domain(host) !== domain(url.hostname) && !["gmail.com", "orange.fr", "wanadoo.fr", "outlook.fr", "outlook.com", "hotmail.fr", "hotmail.com", "yahoo.fr"].includes(host)) continue;
    if (found.size < 100) found.set(email, { email, type: emailType(email), source_url: url.href, discovered_at: now, is_primary: false });
  }
  const links = [];
  for (const match of content.matchAll(/<a\b([^<>]{0,4096})>/gi)) {
    const href = /\bhref\s*=\s*["']([^"']{1,2048})["']/i.exec(match[1])?.[1];
    if (!href) continue;
    const label = content.slice(match.index + match[0].length, match.index + match[0].length + 512).split(/<\/a>/i)[0];
    if (!/contact|propos|about|quipe|team|mentions|legal|sommes/i.test(`${href} ${label}`)) continue;
    try { links.push(safeTarget(new URL(href, url).href, domain(url.hostname)).href); } catch { /* External and unsafe links ignored. */ }
  }
  return { emails: [...found.values()], links };
}
async function crawlWebsite(website, fetcher = fetchPage) {
  if (!website) return { emails: [], status: "not_found", error_code: null };
  const root = safeTarget(website); const allowed = domain(root.hostname);
  const queue = [root.href]; const visited = new Set(); const emails = new Map(); let successes = 0; let errorCode = null;
  while (queue.length && visited.size < MAX_PAGES) {
    const next = queue.shift(); if (visited.has(next)) continue;
    visited.add(next);
    try {
      const url = safeTarget(next, allowed); const page = await fetcher(url);
      if (page.redirect) { queue.unshift(safeTarget(new URL(page.redirect, url).href, allowed).href); continue; }
      if (typeof page.html !== "string" || Buffer.byteLength(page.html) > MAX_BYTES) throw new Error("PAGE_TOO_LARGE");
      successes++;
      const extracted = extract(page.html, url, new Date().toISOString());
      for (const item of extracted.emails) if (!emails.has(item.email) && emails.size < 100) emails.set(item.email, item);
      // Only links from the first successfully fetched page; never recursive crawling.
      if (successes === 1) queue.push(...extracted.links.slice(0, 30));
    } catch (error) { errorCode = ["TIMEOUT", "UNSAFE_DESTINATION", "PAGE_TOO_LARGE"].includes(error.message) ? error.message : "SITE_INACCESSIBLE"; }
  }
  const ranked = [...emails.values()].sort((a, b) => ({ commercial: 0, general: 1, direction: 2, other: 3 }[a.type] - { commercial: 0, general: 1, direction: 2, other: 3 }[b.type]));
  if (ranked.length) ranked[0].is_primary = true;
  if (!successes && !errorCode) errorCode = "SITE_INACCESSIBLE";
  return { emails: ranked, status: ranked.length ? "found" : errorCode ? "failed" : "not_found", error_code: errorCode, pages: visited.size };
}
module.exports = { crawlWebsite, extract, safeTarget, resolvePublic, publicIPv4, validEmail, fetchPage, MAX_PAGES, MAX_BYTES };
