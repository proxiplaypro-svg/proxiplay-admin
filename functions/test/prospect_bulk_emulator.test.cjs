const test = require("node:test");
const assert = require("node:assert/strict");
if (!/^127\.0\.0\.1:\d+$|^localhost:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "")) throw new Error("Local emulator required");
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "demo-prospection-bulk" });
const db = admin.firestore();
const { createProspectEmailService } = require("../src/prospect_email");
const { HttpsError } = require("firebase-functions/v2/https");
let service, sent, reject;
const identity = () => ({ from: "ProxiPlay <no-reply@proxiplay.fr>", replyTo: "contact@proxiplay.fr" });
const call = (action, data = {}) => service.handle({ auth: { uid: "admin" }, data: { action, ...data } });
const prepare = (ids = ["one"], batchId = "batch") => call("batch_prepare", { ids, batchId });
const get = async () => (await call("batch_get", { batchId: "batch" })).batch;
const step = () => call("batch_step", { batchId: "batch" });
const release = () => db.doc("prospection_internal/bulk_smtp_gate").set({ expires: 0, next_at: 0 });
const seed = (id, fields = {}) => db.doc(`prospects/${id}`).set({ name: id, city: "Dunkerque", status: "new", revision: 1, emails: [{ email: `${id}@boutique.fr`, is_primary: true }], ...fields });
test.beforeEach(async () => {
  for (const c of ["prospects", "prospection_internal", "prospection_email_batches"]) await db.recursiveDelete(db.collection(c));
  sent = []; reject = null;
  service = createProspectEmailService({ db, assertAdmin: r => { if (r.auth?.uid !== "admin") throw new HttpsError("permission-denied", "Admin only"); }, sender: { identity, send: async m => { sent.push(m); if (reject) await reject(m); return { provider_message_id: m.id }; } } });
  await seed("one");
});
test.after(async () => { await db.terminate(); await admin.app().delete(); });
test("phone settings, empty phone and preservation of existing drafts", async () => {
  const first = await call("settings_get"); assert.equal(first.settings.phone, "07 59 60 69 86");
  await call("settings_save", { settings: { ...first.settings, phone: "01 02 03 04 05" }, revision: 0 });
  const p = (await call("generate", { id: "one" })).proposal;
  assert.ok(p.body.includes("01 02 03 04 05\nhttps://www.proxiplay.fr")); assert.ok(p.body.includes(first.settings.download_url));
  await call("settings_save", { settings: { ...first.settings, phone: "" }, revision: 1 });
  await prepare(); assert.equal((await db.doc("prospects/one").get()).data().proposal.body, p.body);
  await seed("two"); const next = (await call("generate", { id: "two" })).proposal;
  assert.ok(!next.body.includes("01 02")); assert.ok(!next.body.includes("07 59")); assert.ok(next.body.includes(first.settings.signature + "\nhttps://"));
});
test("server maximum 50, exclusions, one and individual generation", async () => {
  await assert.rejects(prepare(Array.from({ length: 51 }, (_, i) => `p${i}`)), { code: "invalid-argument" });
  await seed("none", { emails: [] }); await seed("blocked", { do_not_contact: true });
  const b = (await prepare(["one", "none", "blocked"])).batch;
  assert.deepEqual(b.items.map(i => i.state), ["ready", "excluded", "excluded"]); assert.equal(sent.length, 0);
  const ids = Array.from({ length: 50 }, (_, i) => `p${i}`); await Promise.all(ids.map(id => seed(id)));
  const large = (await prepare(ids, "fifty")).batch; assert.equal(large.items.length, 50);
  assert.equal(new Set(large.items.map(i => i.draftId)).size, 50);
  for (const i of large.items) { assert.ok(i.body.includes(`présenter ${i.name} aux utilisateurs locaux`)); assert.equal(i.to, `${i.id}@boutique.fr`); }
  assert.equal(sent.length, 0);
});
test("confirmation, complete success, individual logs/status, batch id and double clicks", async () => {
  await seed("two"); await prepare(["one", "two"]);
  await assert.rejects(step(), { code: "failed-precondition" });
  await assert.rejects(call("batch_confirm", { batchId: "batch" }), { code: "invalid-argument" });
  await Promise.all([1, 2].map(() => call("batch_confirm", { batchId: "batch", confirmed: true })));
  await Promise.all([1, 2, 3].map(step)); assert.equal(sent.length, 1);
  await step(); assert.equal(sent.length, 1, "cadence enforced by server");
  await release(); await step(); assert.equal(sent.length, 2);
  await release(); await step(); assert.equal(sent.length, 2);
  for (const id of ["one", "two"]) {
    const p = (await db.doc(`prospects/${id}`).get()).data(); assert.equal(p.status, "contacted"); assert.ok(p.last_contact_at);
    const logs = await db.collection(`prospects/${id}/emails`).get(); const history = await db.collection(`prospects/${id}/history`).get();
    assert.equal(logs.size, 1); assert.equal(history.size, 1); assert.equal(logs.docs[0].data().batch_id, "batch"); assert.equal(history.docs[0].data().batch_id, "batch");
  }
  for (const m of sent) { assert.ok(!m.to.includes(",")); assert.equal(m.cc, undefined); assert.equal(m.bcc, undefined); }
  const again = (await prepare(["one", "two"], "again")).batch; assert.ok(again.items.every(i => i.state === "excluded"));
});
test("partial success, explicit rejection retry only, accepted messages never resent", async () => {
  await seed("two"); await prepare(["one", "two"]); await call("batch_confirm", { batchId: "batch", confirmed: true });
  reject = async m => { if (m.to.startsWith("one@")) throw Object.assign(new Error("private SMTP details"), { responseCode: 450 }); };
  await step(); await release(); await step();
  let b = await get(); assert.deepEqual(b.items.map(i => i.state), ["failed", "sent"]); assert.ok(b.items[0].retryable);
  assert.equal((await db.doc("prospects/one").get()).data().status, "new");
  await assert.rejects(call("batch_retry", { batchId: "batch", id: "two", confirmed: true }));
  await assert.rejects(call("batch_retry", { batchId: "batch", id: "one" }));
  reject = null; await call("batch_retry", { batchId: "batch", id: "one", confirmed: true }); await release(); await step();
  b = await get(); assert.ok(b.items.every(i => i.state === "sent")); assert.equal(sent.filter(m => m.to === "two@boutique.fr").length, 1);
  assert.equal(sent[0].id, sent[2].id); assert.ok(!JSON.stringify(b).includes("private SMTP"));
});
test("ambiguous SMTP failure, browser refresh and timeout never replay a send", async () => {
  await prepare(); await call("batch_confirm", { batchId: "batch", confirmed: true });
  reject = async () => { throw new Error("socket disconnected after DATA"); }; await step();
  const b = (await call("batch_current")).batch; assert.equal(b.items[0].retryable, false);
  await assert.rejects(call("batch_retry", { batchId: b.id, id: "one", confirmed: true }));
  await release(); await step(); assert.equal(sent.length, 1);
});
test("crash recovery reconciles accepted log and never replays sending/unknown", async () => {
  await prepare(); await call("batch_confirm", { batchId: "batch", confirmed: true }); const b = await get();
  await db.doc("prospection_email_batches/batch").update({ items: b.items.map(i => ({ ...i, state: "processing" })) });
  await db.doc(`prospects/one/emails/${b.items[0].draftId}`).set({ status: "sent" });
  await step(); assert.equal((await get()).items[0].state, "sent"); assert.equal(sent.length, 0);
  await db.doc("prospection_email_batches/batch").update({ items: b.items.map(i => ({ ...i, state: "processing" })) });
  await db.doc(`prospects/one/emails/${b.items[0].draftId}`).set({ status: "sending" });
  await step(); assert.equal((await get()).items[0].state, "unknown"); assert.equal(sent.length, 0);
});
test("server rechecks opposition and revision at send time", async () => {
  await seed("two"); await prepare(["one", "two"]); await call("batch_confirm", { batchId: "batch", confirmed: true });
  await db.doc("prospects/one").update({ do_not_contact: true });
  await db.doc("prospects/two").update({ "proposal.revision": 2 });
  await step(); await release(); await step(); assert.equal(sent.length, 0); assert.ok((await get()).items.every(i => i.state === "failed"));
});
test("all bulk actions admin only and cross-admin ownership guarded", async () => {
  const callable = require("../index").prospectEmail;
  for (const action of ["batch_prepare", "batch_current", "batch_get", "batch_confirm", "batch_step", "batch_retry"]) {
    await assert.rejects(callable.run({ data: { action } }), { code: "unauthenticated" });
    await assert.rejects(callable.run({ auth: { uid: "user", token: { email: "user@example.org" } }, data: { action } }), { code: "permission-denied" });
  }
  await prepare(); await db.doc("prospection_email_batches/batch").update({ actor: "another-admin" });
  await assert.rejects(call("batch_get", { batchId: "batch" }), { code: "permission-denied" });
});

test("global gate shared across batches and repeated preparation does not regenerate", async () => {
  await seed("two"); const b = (await prepare()).batch;
  assert.equal((await prepare()).batch.items[0].draftId, b.items[0].draftId);
  await prepare(["two"], "second");
  await call("batch_confirm", { batchId: "batch", confirmed: true });
  await call("batch_confirm", { batchId: "second", confirmed: true });
  await Promise.all([step(), call("batch_step", { batchId: "second" })]);
  assert.equal(sent.length, 1);
  await release(); await step(); await call("batch_step", { batchId: "second" });
  assert.equal(sent.length, 2);
});

test("same generator for individual and bulk; regeneration alone replaces edited drafts with current settings and activity", async () => {
  await seed("one", { name: "Institut Océane", category: "Institut de beauté" });
  await seed("two", { name: "Restaurant Dupont", category: "Restaurant" });
  await seed("three", { name: "Artisan Test", category: "Établissement", subcategory: "plombier" });
  const individual = (await call("generate", { id: "one" })).proposal;
  assert.equal(individual.subject, "Et si 350 utilisateurs découvraient Institut Océane chaque jour ?");
  assert.ok(individual.body.includes("une prestation ou un bon cadeau"));
  const edited = (await call("save", { id: "one", draftId: individual.id, revision: individual.revision, to: individual.to, subject: "Objet retouché", body: "Message manuel conservé" })).proposal;
  const settings = await call("settings_get");
  await call("settings_save", { settings: { ...settings.settings, phone: "01 23 45 67 89", connections_per_day: 712 }, revision: settings.revision });
  const batch = (await prepare(["one", "two", "three"])).batch;
  assert.equal(batch.items[0].body, edited.body); assert.equal(batch.items[0].subject, edited.subject);
  assert.equal(batch.items[1].subject, "Et si 712 utilisateurs découvraient Restaurant Dupont chaque jour ?");
  assert.ok(batch.items[1].body.includes("un repas ou un bon cadeau")); assert.ok(!batch.items[1].body.includes("Institut Océane"));
  assert.ok(batch.items[2].body.includes("un lot que vous choisissez")); assert.ok(!batch.items[2].body.includes("Restaurant Dupont"));
  await assert.rejects(call("generate", { id: "one" }), { code: "failed-precondition" });
  assert.equal((await db.doc("prospects/one").get()).data().proposal.body, edited.body);
  await db.doc("prospects/one").update({ category: "Salon de coiffure" });
  const regenerated = (await call("generate", { id: "one", replace: true })).proposal;
  assert.notEqual(regenerated.id, edited.id); assert.ok(regenerated.subject.includes("712"));
  assert.ok(regenerated.body.includes("une coupe")); assert.ok(regenerated.body.includes("01 23 45 67 89"));
  assert.equal(sent.length, 0);
});
