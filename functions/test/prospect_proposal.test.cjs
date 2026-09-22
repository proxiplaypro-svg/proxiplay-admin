const test = require("node:test");
const assert = require("node:assert/strict");
const { factualProposalGenerator, activityRule } = require("../src/prospect_proposal");
const { DEFAULT_SETTINGS } = require("../src/prospect_settings");

test("exact institute preview, factual traffic, configurable signature and download link", async () => {
  const p = await factualProposalGenerator.generate({ name: "Institut Océane", category: "Institut de beauté" });
  assert.equal(p.subject, "Et si 350 utilisateurs découvraient Institut Océane chaque jour ?");
  assert.equal(p.body, `Bonjour,

Je me permets de vous contacter car je développe Proxiplay, une application locale qui permet aux entreprises du Dunkerquois de se faire découvrir à travers des jeux et des cadeaux.

L'idée pour Institut Océane serait simple : proposer par exemple une prestation ou un bon cadeau à gagner. Votre établissement est alors présenté aux utilisateurs qui viennent tenter leur chance sur l'application.

Proxiplay génère actuellement environ 350 connexions par jour. L'objectif est simple : profiter de cette audience locale pour faire découvrir votre établissement de manière ludique.

Vous pouvez découvrir l'application ici :
https://onelink.to/jx4ee7

Si le principe vous intéresse, je peux vous présenter rapidement le fonctionnement et ce que nous pourrions mettre en place pour Institut Océane.

Pascal
Proxiplay – Jouez la proximité !
07 59 60 69 86
https://www.proxiplay.fr/`);
  assert.ok(!p.body.includes("350 personnes")); assert.ok(!p.body.includes("350 utilisateurs")); assert.ok(!p.body.includes("chaque jour"));
});
for (const [category, sector, phrase] of [
  ["Institut de beauté", "beauty", "une prestation ou un bon cadeau"],
  ["Restaurant français", "restaurant", "un repas ou un bon cadeau"],
  ["Salon de coiffure", "hair", "une coupe"],
  ["Salle de sport", "sport", "une séance"],
  ["Loisirs", "leisure", "une entrée ou une activité"],
  ["Commerce", "retail", "un produit ou un bon cadeau"],
  ["Plombier", "services", "un lot que vous choisissez"],
  ["Habitat", "services", "un lot que vous choisissez"],
  ["Services locaux", "services", "un lot que vous choisissez"],
  ["Garage automobile", "automotive", "un lot adapté"],
]) test(`recorded activity: ${category}`, async () => {
  assert.equal(activityRule({ category }).sector, sector);
  const p = await factualProposalGenerator.generate({ name: "Entreprise Test", category });
  assert.ok(p.subject.includes("Entreprise Test")); assert.ok(p.body.includes(phrase));
  assert.ok(!p.body.includes("prestation gratuite"));
});
test("unknown/ambiguous activity uses fallback, never guesses from name or notes", async () => {
  for (const category of ["", "Institut de formation", "Restaurant et salon de coiffure"]) {
    const p = await factualProposalGenerator.generate({ name: "Institut Océane", category, notes: "institut de beauté", website: "https://beaute.fr" });
    assert.ok(p.body.includes("L'idée est de présenter Institut Océane")); assert.ok(!p.body.includes("une prestation"));
  }
  assert.equal(activityRule({ category: "commerce", subcategory: "beauté" }).sector, "retail");
  assert.equal(activityRule({ category: "Établissement", subcategory: "plombier" }).sector, "services");
  assert.equal(activityRule({ category: "beauty_salon" }).sector, "beauty");
  assert.equal(activityRule({ category: "barber_shop" }).sector, "hair");
});
test("traffic and signature use settings only, empty values leave no dangling lines", async () => {
  const settings = { ...DEFAULT_SETTINGS, connections_per_day: 712, sender_name: "Équipe", signature: "Signature personnalisée", phone: "01 02 03 04 05", website_url: "https://example.org", download_url: "https://example.org/app" };
  const p = await factualProposalGenerator.generate({ name: "Test" }, settings);
  assert.equal(p.subject, "Et si 712 utilisateurs découvraient Test chaque jour ?");
  assert.ok(p.body.includes("environ 712 connexions par jour")); assert.ok(!p.body.includes("350"));
  assert.ok(p.body.endsWith("Équipe\nSignature personnalisée\n01 02 03 04 05\nhttps://example.org/"));
  for (const connections_per_day of [null, ""]) {
    const empty = await factualProposalGenerator.generate({ name: "Test" }, { ...settings, connections_per_day, phone: "" });
    assert.equal(empty.subject, "Faites découvrir Test avec Proxiplay");
    assert.ok(!/connexions|712|01 02|cette audience/.test(empty.body));
    assert.ok(empty.body.endsWith("Signature personnalisée\nhttps://example.org/"));
  }
});
test("long and multiline names keep valid subject and no undefined fallback", async () => {
  const p = await factualProposalGenerator.generate({ name: "A\r\nB" + "x".repeat(500) });
  assert.equal(p.subject.length, 200); assert.ok(!/[\r\n]/.test(p.subject)); assert.ok(p.subject.endsWith("chaque jour ?"));
  assert.ok(!(await factualProposalGenerator.generate({})).body.includes("undefined"));
});
