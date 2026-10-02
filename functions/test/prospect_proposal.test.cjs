const test = require("node:test");
const assert = require("node:assert/strict");
const { factualProposalGenerator } = require("../src/prospect_proposal");
const { DEFAULT_SETTINGS, parseSettings } = require("../src/prospect_settings");

test("default first-email template is the single base and signature is appended once", async () => {
  const draft = await factualProposalGenerator.generate({ name: "Institut Océane", category: "Institut de beauté" });
  assert.equal(draft.subject, DEFAULT_SETTINGS.initial_email_subject);
  assert.ok(draft.body.startsWith(DEFAULT_SETTINGS.initial_email_body));
  assert.equal((draft.body.match(/Pascal/g) || []).length, 1);
  assert.ok(!draft.body.includes("L'idée pour Institut Océane"));
  assert.ok(draft.body.endsWith("Pascal\nProxiplay – Jouez la proximité !\n07 59 60 69 86\nhttps://www.proxiplay.fr/"));
});

test("saved template overrides fallback without changing the separate signature", async () => {
  const settings = { ...DEFAULT_SETTINGS, initial_email_subject: "Objet configurable", initial_email_body: "Bonjour {{non interprété}}\n\nTexte administrateur", sender_name: "Équipe", signature: "Signature personnalisée", phone: "", website_url: "https://example.org" };
  const draft = await factualProposalGenerator.generate({ name: "Test" }, settings);
  assert.equal(draft.subject, "Objet configurable");
  assert.equal(draft.body, "Bonjour {{non interprété}}\n\nTexte administrateur\n\nÉquipe\nSignature personnalisée\nhttps://example.org/");
});

test("template validation rejects invalid subject and body", () => {
  assert.throws(() => parseSettings({ ...DEFAULT_SETTINGS, initial_email_subject: "Objet\ninterdit" }));
  assert.throws(() => parseSettings({ ...DEFAULT_SETTINGS, initial_email_body: "  " }));
});
