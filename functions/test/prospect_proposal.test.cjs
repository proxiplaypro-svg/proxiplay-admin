const test = require("node:test");
const assert = require("node:assert/strict");
const { factualProposalGenerator, activityRule } = require("../src/prospect_proposal");
const { DEFAULT_SETTINGS, parseSettings } = require("../src/prospect_settings");

test("default first-email template is the single base and signature is appended once", async () => {
  const draft = await factualProposalGenerator.generate({ name: "Institut Océane", category: "Institut de beauté" });
  assert.equal(draft.subject, DEFAULT_SETTINGS.initial_email_subject);
  assert.ok(draft.body.startsWith(DEFAULT_SETTINGS.initial_email_body));
  assert.equal((draft.body.match(/Pascal/g) || []).length, 1);
  assert.ok(draft.body.includes("L'idée pour Institut Océane"));
  assert.ok(draft.body.endsWith("Pascal\nProxiplay – Jouez la proximité !\n07 59 60 69 86\nhttps://www.proxiplay.fr/"));
});

test("saved template overrides fallback without changing the separate signature", async () => {
  const settings = { ...DEFAULT_SETTINGS, initial_email_subject: "Objet configurable", initial_email_body: "Bonjour {{non interprété}}\n\nTexte administrateur", sender_name: "Équipe", signature: "Signature personnalisée", phone: "", website_url: "https://example.org" };
  const draft = await factualProposalGenerator.generate({ name: "Test" }, settings);
  assert.equal(draft.subject, "Objet configurable");
  assert.equal(draft.body, "Bonjour {{non interprété}}\n\nTexte administrateur\n\nL'idée est de présenter Test aux utilisateurs locaux à travers un jeu simple, avec un lot adapté à votre activité.\n\nÉquipe\nSignature personnalisée\nhttps://example.org/");
});

test("template validation rejects invalid subject and body", () => {
  assert.throws(() => parseSettings({ ...DEFAULT_SETTINGS, initial_email_subject: "Objet\ninterdit" }));
  assert.throws(() => parseSettings({ ...DEFAULT_SETTINGS, initial_email_body: "  " }));
});

test("relance : modèle distinct, sans ajout qui dénature le texte validé", async () => {
  const draft = await factualProposalGenerator.generate({ name: "Salon Test", category: "Salon de coiffure" }, { ...DEFAULT_SETTINGS, follow_up_email_subject: "Suite à notre échange", follow_up_email_body: "Bonjour, je reviens vers vous." }, { kind: "follow_up" });
  assert.equal(draft.subject, "Suite à notre échange"); assert.equal(draft.body, "Bonjour, je reviens vers vous."); assert.ok(!/350|360 € HT/.test(draft.body));
});

test("relance par défaut : le texte commercial validé reste distinct du premier contact", async () => {
  const draft = await factualProposalGenerator.generate({ name: "Restaurant Test", category: "Restaurant" }, DEFAULT_SETTINGS, { kind: "follow_up" });
  assert.equal(draft.subject, "Et si vos clients jouaient avec vous ?"); assert.ok(draft.body.includes("Pascal Rohart\nFondateur de ProxiPlay")); assert.ok(!draft.body.includes("faire gagner un repas"));
});

for (const category of ["Bijouterie", "Opticien", "Librairie", "Épicerie", "Caviste", "Papeterie", "Chocolaterie", "Pâtisserie", "Boulangerie", "Animalerie", "Mercerie", "Magasin de sport", "sporting_goods_store", "Bakery"]) test(`precise retail activity: ${category}`, async () => {
  const p = await factualProposalGenerator.generate({ name: "Boutique Test", category, subcategory: "sport" });
  assert.equal(activityRule({ category }).sector, "retail");
  assert.ok(p.body.includes("un produit ou un bon cadeau"));
  assert.ok(!p.body.includes("une séance"));
});

test("fitness and climbing activities retain session suggestions", () => {
  for (const category of ["Salle d'escalade", "fitness_center", "sports_club"]) assert.equal(activityRule({ category }).sector, "sport");
});
