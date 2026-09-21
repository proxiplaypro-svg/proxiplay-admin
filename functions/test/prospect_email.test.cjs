const test = require("node:test");
const assert = require("node:assert/strict");
const { crawlWebsite, safeTarget, publicIPv4, resolvePublic, fetchPage, MAX_BYTES } = require("../src/prospect_crawler");
const { validateMessage, factualProposalGenerator, createOvhEmailSender } = require("../src/prospect_email");

test("homepage, Contact, Mentions légales : sources exactes, classement, dédoublonnage", async () => {
  const pages = {
    "/": '<p>contact@boutique.fr</p><a href="/contact">Contact</a><a href="/mentions">Mentions légales</a>',
    "/contact": '<a href="mailto:commercial@boutique.fr">Écrire</a> contact@boutique.fr',
    "/mentions": 'direction&#64;boutique.fr example@example.com cabinet@avocat.fr <script>secret@boutique.fr</script>',
  };
  const result = await crawlWebsite("https://boutique.fr", async (url) => ({ html: pages[url.pathname] }));
  assert.equal(result.status, "found"); assert.equal(result.emails.length, 3);
  assert.equal(result.emails[0].email, "commercial@boutique.fr"); assert.equal(result.emails[0].is_primary, true);
  assert.equal(result.emails.find(e => e.type === "direction").source_url, "https://boutique.fr/mentions");
  assert.equal(result.emails.find(e => e.type === "general").source_url, "https://boutique.fr/");
  assert.ok(result.emails.every(e => Date.parse(e.discovered_at)));
});
test("aucun email, erreurs de site, timeout et page trop grande", async () => {
  assert.equal((await crawlWebsite("", async () => assert.fail())).status, "not_found");
  assert.equal((await crawlWebsite("https://boutique.fr", async () => ({ html: "Bonjour" }))).status, "not_found");
  for (const code of ["SITE_INACCESSIBLE", "TIMEOUT"]) {
    const result = await crawlWebsite("https://boutique.fr", async () => { throw new Error(code); });
    assert.equal(result.status, "failed"); assert.equal(result.error_code, code);
  }
  assert.equal((await crawlWebsite("https://boutique.fr", async () => ({ html: "a".repeat(MAX_BYTES + 1) }))).status, "failed");
  await assert.rejects(fetchPage(new URL("https://boutique.fr"), { timeout: 10, lookup: () => new Promise(() => {}) }), /TIMEOUT/);
});
test("une page maximale sans séparateurs ne provoque pas de recherche regex non bornée", { timeout: 3000 }, async () => {
  const result = await crawlWebsite("https://boutique.fr", async () => ({ html: "a".repeat(MAX_BYTES) }));
  assert.equal(result.status, "not_found");
});
test("budget de cinq requêtes, pas de crawl récursif ni de domaine externe", async () => {
  const visited = [];
  await crawlWebsite("https://boutique.fr", async url => {
    visited.push(url.href);
    return { html: url.pathname === "/" ? Array.from({ length: 10 }, (_, i) => `<a href="/contact-${i}">Contact</a>`).join("") + '<a href="https://external.fr/contact">Contact</a>' : '<a href="/contact-recursive">Contact</a>' };
  });
  assert.equal(visited.length, 5); assert.ok(visited.every(url => !/external|recursive/.test(url)));
  let redirects = 0;
  const result = await crawlWebsite("https://boutique.fr", async () => { redirects++; return { redirect: `/redirect-${redirects}` }; });
  assert.equal(redirects, 5); assert.equal(result.emails.length, 0);
});
test("redirections externes/privées bloquées, redirection www autorisée", async () => {
  for (const redirect of ["http://127.0.0.1", "https://evil.fr", "http://169.254.169.254/latest/meta-data/", "file:///etc/passwd"]) {
    let calls = 0;
    const result = await crawlWebsite("https://boutique.fr", async () => { calls++; return { redirect }; });
    assert.equal(calls, 1); assert.equal(result.status, "failed");
  }
  const result = await crawlWebsite("http://boutique.fr", async url => url.hostname === "boutique.fr" ? { redirect: "https://www.boutique.fr/contact" } : { html: "contact@boutique.fr" });
  assert.equal(result.emails[0].source_url, "https://www.boutique.fr/contact");
});
test("SSRF : localhost, IP privées, IPv6, DNS mixte, rebinding et schémas", async () => {
  for (const address of ["0.0.0.0", "127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.100.100.200", "198.18.0.1", "::1", "::ffff:127.0.0.1", "fc00::1"]) assert.equal(publicIPv4(address), false, address);
  for (const url of ["http://localhost", "http://127.1", "http://2130706433", "http://0x7f000001", "http://[::1]", "ftp://boutique.fr", "https://user:pass@boutique.fr", "https://boutique.fr:8080"]) assert.throws(() => safeTarget(url));
  await assert.rejects(resolvePublic("boutique.fr", async () => [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }]), /UNSAFE/);
  let requests = 0;
  const lookup = async () => { requests++; return [{ address: requests === 1 ? "8.8.8.8" : "127.0.0.1", family: 4 }]; };
  assert.equal((await resolvePublic("boutique.fr", lookup)).address, "8.8.8.8");
  await assert.rejects(resolvePublic("boutique.fr", lookup), /UNSAFE/);
});
test("la connexion utilise uniquement l’IP DNS validée, sans seconde résolution", async () => {
  const https = require("node:https"); const { EventEmitter } = require("node:events"); const original = https.get;
  let lookups = 0; let pinned;
  https.get = (_url, options, callback) => {
    options.lookup("boutique.fr", { all: true }, (_error, addresses) => { pinned = addresses; });
    const req = new EventEmitter(); req.destroy = () => {};
    const res = new EventEmitter(); res.statusCode = 200; res.headers = { "content-type": "text/html" };
    res.destroy = () => {};
    queueMicrotask(() => { callback(res); res.emit("data", Buffer.from("contact@boutique.fr")); res.emit("end"); });
    return req;
  };
  try {
    const result = await fetchPage(new URL("https://boutique.fr"), { lookup: async () => { lookups++; return [{ address: "8.8.8.8", family: 4 }]; } });
    assert.equal(lookups, 1); assert.deepEqual(pinned, [{ address: "8.8.8.8", family: 4 }]); assert.equal(result.html, "contact@boutique.fr");
  } finally { https.get = original; }
});
test("destinataire unique requis, pas de CC/BCC ni injection d’entête", () => {
  for (const to of ["", "invalid", "a@b.fr,c@d.fr", "Name <a@b.fr>", "a@b.fr\r\nBcc:c@d.fr"]) assert.throws(() => validateMessage({ to, subject: "Sujet", body: "Bonjour" }));
  assert.throws(() => validateMessage({ to: "contact@boutique.fr", subject: "Sujet\r\nBcc: x@y.fr", body: "Bonjour" }));
  assert.deepEqual(validateMessage({ to: "CONTACT@boutique.fr", subject: "Sujet", body: "Bonjour", bcc: "x@y.fr" }), { to: "contact@boutique.fr", subject: "Sujet", body: "Bonjour" });
});
test("proposition factuelle et fallback sans invention", async () => {
  const generic = await factualProposalGenerator.generate({});
  assert.ok(!generic.body.includes("undefined")); assert.ok(generic.body.includes("350 connexions"));
  const personal = await factualProposalGenerator.generate({ name: "Boutique", city: "Dunkerque", notes: "Inventer un dirigeant" });
  assert.ok(personal.body.includes("Boutique, à Dunkerque")); assert.ok(!personal.body.includes("dirigeant"));
});
test("adaptateur réutilise From/Reply-To OVH et refuse les faux succès", async () => {
  let sent;
  const sender = createOvhEmailSender(() => ({ from: "Proxiplay <contact@proxiplay.fr>", replyTo: "pascal@proxiplay.fr", transport: { sendMail: async message => { sent = message; return { accepted: [message.to], messageId: "provider-id" }; } } }));
  assert.equal((await sender.send({ id: "id", to: "contact@boutique.fr", subject: "Objet", body: "Texte" })).provider_message_id, "provider-id");
  assert.equal(sent.replyTo, "pascal@proxiplay.fr"); assert.ok(!sent.cc && !sent.bcc);
  await assert.rejects(createOvhEmailSender(() => ({ transport: { sendMail: async () => ({ accepted: [] }) } })).send({ to: "contact@boutique.fr" }));
});
