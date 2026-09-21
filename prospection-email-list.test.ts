import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_FILTERS, matchesProspectFilters, prospectEmailSummary } from "./lib/prospection/list";
import { parseFields, type Prospect } from "./lib/prospection/model";
const prospect = (fields: Partial<Prospect> = {}): Prospect => ({ ...parseFields({ name: "Boutique", city: "Dunkerque" }), id: "p1", revision: 1, normalized_name: "boutique", created_at: "2026-09-21T10:00:00Z", updated_at: "2026-09-21T10:00:00Z", qualification: null, qualification_provider: null, ...fields });
const emails: Prospect["emails"] = [
  { email: "info@boutique.fr", type: "general", source_url: "https://boutique.fr", discovered_at: "2026-09-21T10:00:00Z", is_primary: false },
  { email: "commercial@boutique.fr", type: "commercial", source_url: "https://boutique.fr/contact", discovered_at: "2026-09-21T10:00:00Z", is_primary: true },
];
test("email primaire trouvé et nombre d’emails supplémentaires", () => {
  assert.deepEqual(prospectEmailSummary(prospect({ emails })), { email: "commercial@boutique.fr", state: "found", label: "Email trouvé", additional: 1 });
  assert.equal(prospectEmailSummary(prospect({ emails: [emails[1]] })).additional, 0);
});
for (const [status, label] of [["not_found", "Aucun email public trouvé"], ["failed", "Recherche email échouée"], ["not_started", "Email non recherché"], ["running", "Recherche email en cours…"]] as const) {
  test(`affichage ${status}`, () => { const summary = prospectEmailSummary(prospect({ email_enrichment_status: status })); assert.equal(summary.state, status); assert.equal(summary.label, label); });
}
test("anciens prospects et email manuel : pas de faux introuvable ni de collecte revendiquée", () => {
  assert.equal(prospectEmailSummary(prospect()).state, "not_started");
  assert.equal(prospectEmailSummary(prospect({ email: "manuel@boutique.fr", email_enrichment_status: "not_found" })).label, "Email renseigné");
  assert.equal(prospectEmailSummary(prospect({ emails })).email, "commercial@boutique.fr");
});
for (const state of ["found", "not_found", "failed", "not_started"] as const) {
  test(`filtre ${state} combiné au statut Nouveaux`, () => {
    const candidates = [prospect({ emails }), prospect({ id: "none", email_enrichment_status: "not_found" }), prospect({ id: "failed", email_enrichment_status: "failed" }), prospect({ id: "untouched" })];
    const filter = { ...EMPTY_FILTERS, status: "new", email: state };
    assert.equal(candidates.filter(p => matchesProspectFilters(p, filter)).length, 1);
    assert.equal(candidates.map(p => ({ ...p, status: "contacted" as const })).filter(p => matchesProspectFilters(p, filter)).length, 0);
  });
}
test("recherche textuelle sur emails enrichis et combinaison ville/source/date", () => {
  const p = prospect({ emails });
  assert.equal(matchesProspectFilters(p, { ...EMPTY_FILTERS, email: "found", city: "Dunkerque", source: "manual", date: "2026-09-21", query: "commercial@boutique.fr" }), true);
  assert.equal(matchesProspectFilters(p, { ...EMPTY_FILTERS, email: "found", city: "Calais" }), false);
});
test("après envoi réussi, le statut serveur exclut immédiatement Nouveaux", () => {
  const p = prospect({ emails }); const filter = { ...EMPTY_FILTERS, status: "new", email: "found" };
  assert.equal(matchesProspectFilters(p, filter), true);
  assert.equal(matchesProspectFilters({ ...p, status: "contacted" }, filter), false);
});
