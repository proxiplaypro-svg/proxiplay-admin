const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RETENTION_MS,
  handlePartnerLead,
  leadEmail,
  verifyTurnstileToken,
} = require("../src/partner_lead");

const NOW = new Date("2026-11-01T10:00:00.000Z");
const BODY = {
  business: "Boulangerie Test",
  name: "Camille Test",
  email: "camille@example.invalid",
  phone: "0600000000",
  city: "Dunkerque",
  activity: "Boulangerie",
  website: "",
  turnstileToken: "jeton",
};

function fakeDeps(overrides = {}) {
  const calls = { saved: [], updates: [], mails: [], errors: [] };
  const deps = {
    verifyTurnstile: async () => true,
    saveLead: async (lead) => { calls.saved.push(lead); return "lead-1"; },
    updateLead: async (id, patch) => { calls.updates.push({ id, patch }); },
    sendMail: async (message) => { calls.mails.push(message); },
    describeMailError: () => "SMTP authentication failed. Check OVH_SMTP_USER and OVH_SMTP_PASS.",
    logger: { error: (message, data) => calls.errors.push({ message, data }) },
    now: () => NOW,
    ...overrides,
  };
  return { deps, calls };
}

test("enregistre la demande avant l'e-mail, puis la marque envoyée", async () => {
  const order = [];
  const { deps, calls } = fakeDeps({
    saveLead: async (lead) => { order.push("save"); calls.saved.push(lead); return "lead-1"; },
    sendMail: async (message) => { order.push("mail"); calls.mails.push(message); },
  });
  const result = await handlePartnerLead({ body: BODY, deps });
  assert.deepEqual(result, { status: 200, body: { ok: true } });
  assert.deepEqual(order, ["save", "mail"]);
  const saved = calls.saved[0];
  assert.deepEqual(
    Object.keys(saved).sort(),
    ["activity", "business", "city", "createdAt", "email", "expireAt", "name", "phone", "source", "status"],
  );
  assert.equal(saved.status, "received");
  assert.equal(saved.expireAt.getTime(), NOW.getTime() + RETENTION_MS);
  assert.ok(!("turnstileToken" in saved) && !("website" in saved), "ni jeton ni pot de miel stockés");
  assert.deepEqual(calls.updates, [{ id: "lead-1", patch: { status: "emailed", emailedAt: NOW } }]);
});

test("l'e-mail contient tous les champs et la référence Firestore", async () => {
  const { deps, calls } = fakeDeps();
  await handlePartnerLead({ body: BODY, deps });
  const mail = calls.mails[0];
  assert.equal(mail.replyTo, BODY.email);
  assert.equal(mail.subject, "[Partenariat] Boulangerie Test – Dunkerque");
  for (const expected of ["Enseigne : Boulangerie Test", "Contact : Camille Test", "Email : camille@example.invalid",
    "Téléphone : 0600000000", "Ville : Dunkerque", "Activité : Boulangerie", "Référence : partner_leads/lead-1"]) {
    assert.ok(mail.text.includes(expected), expected);
  }
});

test("champs facultatifs absents : « Non renseigné » ; ancienne page sans ville acceptée", async () => {
  const { deps, calls } = fakeDeps();
  const { city, activity, phone, ...legacy } = BODY;
  const result = await handlePartnerLead({ body: legacy, deps });
  assert.equal(result.status, 200);
  assert.match(calls.mails[0].text, /Ville : Non renseigné/);
  assert.match(calls.mails[0].text, /Activité : Non renseigné/);
  assert.match(calls.mails[0].text, /Téléphone : Non renseigné/);
});

test("panne SMTP : la demande est conservée, marquée en échec, réponse 200 delivery=pending", async () => {
  const { deps, calls } = fakeDeps({ sendMail: async () => { throw new Error("535 auth"); } });
  const result = await handlePartnerLead({ body: BODY, deps });
  assert.deepEqual(result, { status: 200, body: { ok: true, delivery: "pending" } });
  assert.equal(calls.saved.length, 1);
  assert.deepEqual(calls.updates[0], { id: "lead-1", patch: { status: "email_failed", emailError: "SMTP authentication failed. Check OVH_SMTP_USER and OVH_SMTP_PASS." } });
  assert.equal(calls.errors[0].data.leadId, "lead-1");
});

test("panne Firestore puis e-mail envoyé : 200, e-mail sans référence", async () => {
  const { deps, calls } = fakeDeps({ saveLead: async () => { throw new Error("unavailable"); } });
  const result = await handlePartnerLead({ body: BODY, deps });
  assert.deepEqual(result, { status: 200, body: { ok: true } });
  assert.match(calls.mails[0].text, /Référence : non enregistrée/);
  assert.equal(calls.updates.length, 0);
});

test("panne Firestore ET SMTP : 502 delivery_failed", async () => {
  const { deps } = fakeDeps({
    saveLead: async () => { throw new Error("unavailable"); },
    sendMail: async () => { throw new Error("535 auth"); },
  });
  assert.deepEqual(await handlePartnerLead({ body: BODY, deps }), { status: 502, body: { error: "delivery_failed" } });
});

test("jeton absent : 400 missing_turnstile_token, sans appel Turnstile ni écriture", async () => {
  let verifyCalls = 0;
  const { deps, calls } = fakeDeps({ verifyTurnstile: async () => { verifyCalls += 1; return true; } });
  for (const turnstileToken of [undefined, "", "   "]) {
    const result = await handlePartnerLead({ body: { ...BODY, turnstileToken }, deps });
    assert.deepEqual(result, { status: 400, body: { error: "missing_turnstile_token" } });
  }
  assert.equal(verifyCalls, 0);
  assert.equal(calls.saved.length, 0);
});

test("Turnstile indisponible (exception) : 503, rien n'est écrit ni envoyé", async () => {
  const { deps, calls } = fakeDeps({ verifyTurnstile: async () => { throw new Error("timeout"); } });
  assert.deepEqual(await handlePartnerLead({ body: BODY, deps }), { status: 503, body: { error: "verification_unavailable" } });
  assert.equal(calls.saved.length + calls.mails.length, 0);
});

test("jeton refusé : 400 verification_failed", async () => {
  const { deps, calls } = fakeDeps({ verifyTurnstile: async () => false });
  assert.deepEqual(await handlePartnerLead({ body: BODY, deps }), { status: 400, body: { error: "verification_failed" } });
  assert.equal(calls.saved.length, 0);
});

test("champs invalides et pot de miel", async () => {
  const { deps, calls } = fakeDeps();
  assert.equal((await handlePartnerLead({ body: { ...BODY, email: "pas-un-email" }, deps })).status, 400);
  assert.equal((await handlePartnerLead({ body: { ...BODY, city: "x".repeat(121) }, deps })).status, 400);
  assert.equal((await handlePartnerLead({ body: { ...BODY, activity: "a\nb" }, deps })).status, 400);
  assert.deepEqual(await handlePartnerLead({ body: { ...BODY, website: "spam" }, deps }), { status: 200, body: { ok: true } });
  assert.equal(calls.saved.length + calls.mails.length, 0);
});

test("verifyTurnstileToken : succès, refus, erreur HTTP", async () => {
  const reply = (status, json) => async (url, options) => {
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(options.body.get("response"), "jeton");
    assert.ok(options.signal, "délai d'expiration requis");
    return { ok: status === 200, status, json: async () => json };
  };
  assert.equal(await verifyTurnstileToken({ secret: "s", token: "jeton", fetchImpl: reply(200, { success: true }) }), true);
  assert.equal(await verifyTurnstileToken({ secret: "s", token: "jeton", fetchImpl: reply(200, { success: false }) }), false);
  await assert.rejects(verifyTurnstileToken({ secret: "s", token: "jeton", fetchImpl: reply(500, {}) }), /HTTP 500/);
});

test("leadEmail n'insère pas de saut de ligne venant des champs", () => {
  const mail = leadEmail({ business: "A", name: "B", email: "c@d.ef", phone: "", city: "", activity: "" }, "x");
  assert.equal(mail.text.split("\n").length, 7);
});
