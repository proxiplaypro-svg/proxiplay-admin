const test = require("node:test");
const assert = require("node:assert/strict");
if (!/^127\.0\.0\.1:\d+$|^localhost:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "")) throw new Error("Local Firestore emulator required");
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "demo-prospection" });
const db = admin.firestore();
const { createProspectEmailService } = require("../src/prospect_email");
const { HttpsError } = require("firebase-functions/v2/https");
let sent; let service;
const assertAdmin = request => { if (request.auth?.uid !== "admin") throw new HttpsError("permission-denied", "Admin required"); };
const call = (action, extra = {}) => service.handle({ auth: { uid: "admin" }, data: { action, id: "one", ...extra } });
const prospectRef = () => db.doc("prospects/one");
async function seed(id = "one", fields = {}) { await db.doc(`prospects/${id}`).set({ name: "Boutique", city: "Dunkerque", website: "https://boutique.fr", email: "manual@boutique.fr", revision: 1, status: "new", ...fields }); }
async function draft() { return (await call("generate")).proposal; }
async function logs() { return (await prospectRef().collection("emails").get()).docs.map(doc => doc.data()); }
test.beforeEach(async () => {
  for (const collection of ["prospects", "prospection_internal"]) await db.recursiveDelete(db.collection(collection));
  sent = [];
  service = createProspectEmailService({ db, assertAdmin, sender: { send: async message => { sent.push(message); return { provider_message_id: "mock-id" }; } } });
  await seed();
});
test.after(async () => { await db.terminate(); await admin.app().delete(); });

test("vraie garde callable : toutes les actions réservées à l’admin", async () => {
  const callable = require("../index").prospectEmail;
  for (const action of ["send", "generate", "enrich", "enrich_batch", "erase", "primary", "save", "do_not_contact"]) {
    await assert.rejects(callable.run({ data: { action } }), { code: "unauthenticated" });
    await assert.rejects(callable.run({ auth: { uid: "user", token: { email: "user@boutique.fr" } }, data: { action } }), { code: "permission-denied" });
  }
});
test("envoi réussi, historique, contact et journal ; répétitions concurrentes = un seul email", async () => {
  const proposal = await draft();
  const input = { draftId: proposal.id, revision: proposal.revision, confirmed: true };
  const results = await Promise.all(Array.from({ length: 8 }, () => call("send", input)));
  assert.equal(sent.length, 1); assert.ok(results.some(r => r.status === "sent"));
  assert.equal((await logs()).length, 1); assert.equal((await logs())[0].provider_message_id, "mock-id");
  const data = (await prospectRef().get()).data();
  assert.equal(data.status, "contacted"); assert.ok(data.last_contact_at);
  assert.equal((await prospectRef().collection("history").get()).size, 1);
  await call("send", input); assert.equal(sent.length, 1);
  const next = (await call("generate", { replace: true })).proposal;
  await call("send", { draftId: next.id, revision: next.revision, confirmed: true }); assert.equal(sent.length, 2);
});
test("confirmation, révision, destinataire requis et verrou do_not_contact", async () => {
  const proposal = await draft();
  await assert.rejects(call("send", { draftId: proposal.id, revision: 1 }), { code: "invalid-argument" });
  await assert.rejects(call("save", { draftId: proposal.id, revision: 1, to: "", subject: "Objet", body: "Bonjour" }), { code: "invalid-argument" });
  await assert.rejects(call("send", { draftId: proposal.id, revision: 9, confirmed: true }), { code: "failed-precondition" });
  await call("do_not_contact", { value: true });
  await assert.rejects(call("send", { draftId: proposal.id, revision: 1, confirmed: true }), { code: "failed-precondition" });
  assert.equal(sent.length, 0); assert.equal((await logs()).length, 0);
});
test("échec provider : pas d’historique réussi ni contact ; même clé jamais rejouée", async () => {
  service = createProspectEmailService({ db, assertAdmin, sender: { send: async () => { sent.push(1); throw new Error("secret-must-not-be-stored"); } } });
  const proposal = await draft(); const input = { draftId: proposal.id, revision: 1, confirmed: true };
  await assert.rejects(call("send", input), { code: "internal" });
  assert.equal((await call("send", input)).status, "failed"); assert.equal(sent.length, 1);
  assert.equal((await prospectRef().collection("history").get()).size, 0);
  const data = (await prospectRef().get()).data(); assert.equal(data.status, "new"); assert.ok(!data.last_contact_at);
  assert.equal((await logs())[0].status, "failed"); assert.ok(!JSON.stringify(await logs()).includes("secret-must"));
});
test("message édité sauvegardé ; une ancienne révision ne peut pas envoyer", async () => {
  const proposal = await draft();
  const saved = (await call("save", { draftId: proposal.id, revision: 1, to: "autre@boutique.fr", subject: "Nouvel objet", body: "Message personnel" })).proposal;
  await assert.rejects(call("send", { draftId: proposal.id, revision: 1, confirmed: true }), { code: "failed-precondition" });
  await call("send", { draftId: saved.id, revision: saved.revision, confirmed: true });
  assert.equal(sent[0].to, "autre@boutique.fr"); assert.equal(sent[0].body, "Message personnel");
});
test("email manuel préservé, adresse principale et suppression des seules données enrichies", async () => {
  service = createProspectEmailService({ db, assertAdmin, crawler: async () => ({ emails: ["contact", "commercial"].map((local, i) => ({ email: `${local}@boutique.fr`, type: "general", source_url: "https://boutique.fr/contact", discovered_at: new Date().toISOString(), is_primary: i === 0 })), status: "found" }) });
  await call("enrich"); let data = (await prospectRef().get()).data();
  assert.equal(data.email, "manual@boutique.fr"); assert.equal(data.emails.length, 2);
  await call("primary", { email: "commercial@boutique.fr" }); await call("enrich");
  data = (await prospectRef().get()).data(); assert.equal(data.emails.filter(e => e.is_primary).length, 1); assert.equal(data.emails.find(e => e.is_primary).email, "commercial@boutique.fr");
  await call("erase"); data = (await prospectRef().get()).data();
  assert.equal(data.email, "manual@boutique.fr"); assert.deepEqual(data.emails, []); assert.equal(data.email_enrichment_status, "not_started");
});
test("lot : statistiques et isolation des erreurs", async () => {
  await seed("two", { website: "https://empty.fr" }); await seed("three", { website: "https://failed.fr" });
  service = createProspectEmailService({ db, assertAdmin, crawler: async website => {
    if (website.includes("failed")) throw new Error("timeout");
    if (website.includes("empty")) return { emails: [], status: "not_found" };
    return { emails: [{ email: "contact@boutique.fr", type: "general", is_primary: true, source_url: website, discovered_at: new Date().toISOString() }], status: "found" };
  } });
  const result = await call("enrich_batch", { ids: ["one", "two", "three"] });
  assert.equal(result.found, 1); assert.equal(result.not_found, 1); assert.equal(result.failed, 1); assert.equal(result.emails, 1);
});
test("sémaphore distribué : maximum trois crawls, même entre deux services", async () => {
  let active = 0; let peak = 0; let release;
  const hold = new Promise(resolve => { release = resolve; });
  const crawler = async () => { active++; peak = Math.max(active, peak); await hold; active--; return { emails: [], status: "not_found" }; };
  service = createProspectEmailService({ db, assertAdmin, crawler });
  const other = createProspectEmailService({ db, assertAdmin, crawler });
  for (let i = 2; i <= 6; i++) await seed(String(i));
  const first = call("enrich_batch", { ids: ["one", "2", "3"] });
  const second = other.handle({ auth: { uid: "admin" }, data: { action: "enrich_batch", ids: ["4", "5", "6"] } });
  try {
    const deadline = Date.now() + 15000;
    while (active < 3 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(active, 3);
    await new Promise(resolve => setTimeout(resolve, 1000));
    assert.equal(peak, 3);
  } finally { release(); }
  await Promise.all([first, second]); assert.equal(peak, 3);
  assert.deepEqual((await db.doc("prospection_internal/email_crawl_slots").get()).data().slots, []);
});
test("suppression pendant crawl invalide son résultat", async () => {
  let release; let started;
  const waiting = new Promise(resolve => { started = resolve; });
  service = createProspectEmailService({ db, assertAdmin, crawler: () => { started(); return new Promise(resolve => { release = resolve; }); } });
  const crawling = call("enrich"); await waiting; await call("erase");
  release({ status: "found", emails: [{ email: "contact@boutique.fr", is_primary: true }] }); await crawling;
  assert.deepEqual((await prospectRef().get()).data().emails, []);
});
test("envoi en cours : ni régénération ni suppression des coordonnées", async () => {
  await prospectRef().update({ email_sending_id: "pending" });
  await assert.rejects(call("generate"), { code: "failed-precondition" });
  await assert.rejects(call("erase"), { code: "failed-precondition" });
});
test("statut avancé conservé après acceptation SMTP", async () => {
  await prospectRef().update({ status: "meeting" }); const proposal = await draft();
  await call("send", { draftId: proposal.id, revision: 1, confirmed: true });
  assert.equal((await prospectRef().get()).data().status, "meeting");
});
test("acceptation SMTP puis panne Firestore : verrou durable, aucun renvoi ni faux historique", async () => {
  let transactions = 0;
  const failingDb = { collection: (...args) => db.collection(...args), doc: (...args) => db.doc(...args),
    runTransaction: callback => { transactions++; if (transactions === 3) throw new Error("Finalization unavailable"); return db.runTransaction(callback); } };
  service = createProspectEmailService({ db: failingDb, assertAdmin, sender: { send: async message => { sent.push(message); return { provider_message_id: "mock-id" }; } } });
  const proposal = await draft(); const input = { draftId: proposal.id, revision: 1, confirmed: true };
  await assert.rejects(call("send", input), /Finalization unavailable/);
  assert.equal((await call("send", input)).status, "sending"); assert.equal(sent.length, 1);
  assert.equal((await logs())[0].status, "sending"); assert.equal((await prospectRef().collection("history").get()).size, 0);
  assert.equal((await prospectRef().get()).data().email_sending_id, proposal.id);
  await assert.rejects(call("generate", { replace: true }), { code: "failed-precondition" });
});
