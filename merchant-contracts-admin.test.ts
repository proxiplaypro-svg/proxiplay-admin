// Parcours de souscription V2.1 (phase 1, tranche 1) : fonctions pures de la
// console admin. Aucun service Firebase n'est contacte.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePromoForm, promoLabel, repLinkUrl } from "./lib/admin/merchantContracts";

const baseForm = { code: " bienvenue ", kind: "amount", value: "65", offers: ["autonome"], validUntil: "", maxUses: "", repId: "", active: true };

test("code promotionnel : montant en euros HT converti en centimes, code en majuscules, aucun identifiant Stripe", () => {
  const payload = parsePromoForm(baseForm);
  assert.deepEqual(payload, {
    code: "BIENVENUE", kind: "amount", value: 6500, offers: ["autonome"], validUntil: null, maxUses: null, repId: null, active: true,
  });
  assert.ok(!("stripe_promotion_code_id" in payload));
  assert.equal(parsePromoForm({ ...baseForm, kind: "percent", value: "10", repId: "rep1", maxUses: "5" }).value, 10);
  assert.equal(parsePromoForm({ ...baseForm, offers: ["autonome", "custom"] }).offers.length, 1, "catalogue uniquement");
});

test("code promotionnel : saisies invalides refusees avant tout appel", () => {
  assert.throws(() => parsePromoForm({ ...baseForm, code: "a" }), /Code/);
  assert.throws(() => parsePromoForm({ ...baseForm, kind: "free" }), /Type/);
  assert.throws(() => parsePromoForm({ ...baseForm, kind: "percent", value: "150" }), /Pourcentage/);
  assert.throws(() => parsePromoForm({ ...baseForm, value: "0,5" }), /Montant/);
  assert.throws(() => parsePromoForm({ ...baseForm, maxUses: "0" }), /utilisations/);
});

test("lien nominatif : URL du site, chemin attendu seulement", () => {
  assert.equal(repLinkUrl("/espace-commercant/?lien=abc"), "https://www.proxiplay.fr/espace-commercant/?lien=abc");
  assert.throws(() => repLinkUrl("https://ailleurs.example/?lien=abc"));
});

test("libelles de remise : premiere annee uniquement", () => {
  assert.equal(promoLabel({ kind: "percent", value: 10 }), "10 % sur la première année");
  assert.match(promoLabel({ kind: "amount", value_cents: 6500 }).replace(/ | /g, " "), /^65,00 € HT sur la première année$/);
});

test("la page des commerciaux n'ecrit jamais directement dans Firestore", () => {
  const page = readFileSync("app/admin/commerciaux/page.tsx", "utf8");
  const lib = readFileSync("lib/firebase/merchantContractAdmin.ts", "utf8");
  for (const source of [page, lib]) assert.doesNotMatch(source, /\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\b/);
  assert.match(lib, /"adminUpsertSalesRep"/);
  assert.match(lib, /"adminCreateRepLink"/);
  assert.match(lib, /"adminUpsertPromoCode"/);
});

// ---- lot 1.2-min : verification manuelle
import { CHECKS, REFUSAL_MOTIFS, blockingChecks, checksFromForm } from "./lib/admin/merchantContracts";

test("les 8 controles de la checklist G, dans l'ordre", () => {
  assert.deepEqual(CHECKS.map((c) => c.id), ["siret", "identity", "activity", "duplicate", "offer", "origin", "cgv", "fraud"]);
});

test("confirmation bloquee tant que les 8 controles ne sont pas « Conforme »", () => {
  assert.equal(blockingChecks(undefined).length, 8);
  const all = Object.fromEntries(CHECKS.map((c) => [c.id, { result: "pass" as const }]));
  assert.deepEqual(blockingChecks(all), []);
  assert.deepEqual(blockingChecks({ ...all, fraud: { result: "manual" } }), ["Fraude"]);
});

test("formulaire des controles : seulement les lignes renseignees ; resultat inconnu refuse", () => {
  const entries = Object.fromEntries(CHECKS.map((c) => [c.id, { result: "", note: "" }]));
  entries.siret = { result: "pass", note: " Annuaire OK " };
  assert.deepEqual(checksFromForm(entries), { siret: { result: "pass", note: "Annuaire OK" } });
  entries.fraud = { result: "ok", note: "" };
  assert.throws(() => checksFromForm(entries), /Résultat invalide pour Fraude/);
});

test("motifs de refus : les quatre de l'art. 4.1", () => {
  assert.deepEqual(Object.keys(REFUSAL_MOTIFS), ["activity", "inaccurate", "fraud", "unavailable"]);
});

test("la page des souscriptions n'ecrit jamais directement dans Firestore et confirme avant un refus", () => {
  const page = readFileSync("app/admin/souscriptions/page.tsx", "utf8");
  assert.doesNotMatch(page, /\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\b/);
  assert.match(page, /window\.confirm\(/);
  assert.match(page, /expectedVersion: selected\.data\.state_version/);
});

test("lot 1.3 : la fiche affiche l'etat des alertes (un jour ouvre, prioritaire au-dela de deux)", () => {
  const page = readFileSync("app/admin/souscriptions/page.tsx", "utf8");
  assert.match(page, /<dt>Alertes<\/dt>/);
  assert.match(page, /délai de deux jours ouvrés dépassé/);
});

test("lot 1.4 : confirmation par le backend, bloquee tant que les controles ou l'enseigne manquent, avec confirmation explicite", () => {
  const page = readFileSync("app/admin/souscriptions/page.tsx", "utf8");
  const lib = readFileSync("lib/firebase/merchantContractAdmin.ts", "utf8");
  assert.match(lib, /"adminConfirmMerchantContract"/);
  assert.match(page, /disabled=\{busy \|\| blockingChecks\(checks\)\.length > 0 \|\| !c\.enseigne_id\}/);
  assert.match(page, /le contrat est conclu à l'envoi/);
  // Tranche 2 : la console affiche le miroir de l'abonnement, mais n'appelle
  // jamais Stripe et ne cree aucun paiement.
  assert.doesNotMatch(page + lib, /createContractCheckoutSession|checkout.sessions|api.stripe.com|from "stripe"/);
});

// ---- correction : configuration du parcours
import { parseConfigForm } from "./lib/admin/merchantContracts";

test("configuration : CGV complete ou rien ; adresse des alertes vide = adresse par defaut", () => {
  const empty = { version: "", sha256: "", storagePath: "", url: "", effectiveDate: "", adminAlertEmail: "" };
  assert.deepEqual(parseConfigForm(empty), { adminAlertEmail: null });
  const full = { version: "2.1", sha256: "A".repeat(64), storagePath: "legal/cgv/CGV_V2.1.pdf",
    url: "https://www.proxiplay.fr/cgv.pdf", effectiveDate: "2026-12-01", adminAlertEmail: " alertes@proxiplay.fr " };
  assert.deepEqual(parseConfigForm(full), {
    cgv: { version: "2.1", sha256: "a".repeat(64), storagePath: "legal/cgv/CGV_V2.1.pdf", url: "https://www.proxiplay.fr/cgv.pdf", effectiveDate: "2026-12-01" },
    adminAlertEmail: "alertes@proxiplay.fr",
  });
  assert.throws(() => parseConfigForm({ ...empty, version: "2.1" }), /tous les champs/);
  assert.throws(() => parseConfigForm({ ...full, sha256: "abc" }), /SHA-256/);
  assert.throws(() => parseConfigForm({ ...full, url: "http://x.fr/cgv.pdf" }), /https/);
});

test("configuration : ecrite par le backend seulement, confirmation avant d'ouvrir ou de fermer", () => {
  const panel = readFileSync("components/admin/MerchantContractsConfigPanel.tsx", "utf8");
  assert.doesNotMatch(panel, /\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\b/);
  assert.match(readFileSync("lib/firebase/merchantContractAdmin.ts", "utf8"), /"adminUpdateMerchantContractsConfig"/);
  assert.match(panel, /window\.confirm\(/);
  assert.match(readFileSync("app/admin/souscriptions/page.tsx", "utf8"), /<MerchantContractsConfigPanel \/>/);
});

// ---- tranche 2a, lot 1.6
import { CONTRACT_STATE_LABELS, canSendPaymentInvitation } from "./lib/admin/merchantContracts";

test("lot 1.6 : libelles des etats et envoi de l'invitation seulement quand il est permis", () => {
  for (const state of ["withdrawal_pending", "payment_invited", "active", "withdrawn", "closed_unpaid", "ended"]) {
    assert.ok(CONTRACT_STATE_LABELS[state], state);
  }
  const now = Date.UTC(2026, 11, 20);
  assert.equal(canSendPaymentInvitation("payment_invited", null, now), true);
  assert.equal(canSendPaymentInvitation("withdrawal_pending", now + 1, now), false, "delai de retractation en cours (art. 7.4)");
  assert.equal(canSendPaymentInvitation("withdrawal_pending", now - 1, now), true);
  assert.equal(canSendPaymentInvitation("active", null, now), false);
});

test("lot 1.6 : panneau des e-mails en echec, actions par le backend seulement", () => {
  const panel = readFileSync("components/admin/MailOutboxPanel.tsx", "utf8");
  const lib = readFileSync("lib/firebase/merchantContractAdmin.ts", "utf8");
  assert.doesNotMatch(panel, /\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\b/);
  for (const name of ["adminSendPaymentInvitation", "adminRetryMailOutbox", "adminAbandonMailOutbox", "adminResolveAlert"]) {
    assert.match(lib, new RegExp(`"${name}"`));
  }
  assert.match(readFileSync("app/admin/souscriptions/page.tsx", "utf8"), /<MailOutboxPanel \/>/);
});

test("lot 1.8 : la fiche montre l'abonnement de l'enseigne et les remboursements, en lecture seule", () => {
  const page = readFileSync("app/admin/souscriptions/page.tsx", "utf8");
  assert.match(page, /<dt>Abonnement<\/dt>/);
  assert.match(page, /<dt>Remboursements<\/dt>/);
  assert.match(readFileSync("lib/firebase/merchantContractAdmin.ts", "utf8"), /doc\(db, "enseigne_subscriptions", enseigneId\)/);
});

// ---- tranche 2a, lot 1.5
import { canRecordWithdrawal } from "./lib/admin/merchantContracts";

test("lot 1.5 : saisie d'une retractation pour une souscription demarchee seulement, par le backend", () => {
  assert.equal(canRecordWithdrawal("withdrawal_pending", "demarchee"), true);
  assert.equal(canRecordWithdrawal("active", "demarchee"), true);
  assert.equal(canRecordWithdrawal("active", "spontanee"), false);
  assert.equal(canRecordWithdrawal("withdrawn", "demarchee"), false);
  const page = readFileSync("app/admin/souscriptions/page.tsx", "utf8");
  assert.match(page, /La date d&apos;envoi fait foi/);
  assert.match(page, /L221-20/);
  assert.match(readFileSync("lib/firebase/merchantContractAdmin.ts", "utf8"), /"adminRecordWithdrawal"/);
});
