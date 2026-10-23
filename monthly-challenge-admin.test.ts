import assert from "node:assert/strict";
import test from "node:test";
import {
  challengeId,
  challengeStatus,
  emptyForm,
  formFromConfig,
  isLocked,
  monthBounds,
  payloadFromForm,
  stateFromConfig,
  validateForm,
} from "./lib/admin/monthlyChallenge";

const seconds = (iso: string) => ({ _seconds: Date.parse(iso) / 1000, _nanoseconds: 0 });

test("identifiants et bornes de mois, y compris février et décembre", () => {
  assert.equal(challengeId("attendance", "2026-11"), "2026-11");
  assert.equal(challengeId("merchant", "2026-11"), "merchant_2026-11");
  assert.deepEqual(monthBounds("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
  assert.deepEqual(monthBounds("2026-12"), { start: "2026-12-01", end: "2026-12-31" });
});

test("le partenaire est facultatif pour le Défi du mois, obligatoire pour le Commerçant du mois", () => {
  const proxiplay = { ...emptyForm("attendance", "2026-11"), title: "Défi", prizeTitle: "Bon", enabled: true };
  assert.equal(validateForm(proxiplay), null);
  assert.equal(payloadFromForm(proxiplay).enseigne_ref, null);
  const merchant = { ...proxiplay, type: "merchant" as const };
  assert.match(validateForm(merchant) ?? "", /commerçant partenaire/);
  const withPartner = { ...merchant, partnerShopId: "shop1" };
  assert.equal(validateForm(withPartner), null);
  const payload = payloadFromForm(withPartner, "La Boutique");
  assert.equal(payload.challenge_id, "merchant_2026-11");
  assert.equal(payload.enseigne_ref, "enseignes/shop1");
  assert.equal(payload.enseigne_name, "La Boutique");
});

test("les dates sont envoyées à midi UTC pour rester le bon jour à Paris", () => {
  const payload = payloadFromForm({ ...emptyForm("attendance", "2026-11"), title: "D", prizeTitle: "L" });
  assert.equal(payload.start_date, "2026-11-01T12:00:00Z");
  assert.equal(payload.end_date, "2026-11-30T12:00:00Z");
});

test("validations : période dans le mois, objectif réaliste, titre et lot pour activer", () => {
  const base = { ...emptyForm("attendance", "2026-11"), title: "D", prizeTitle: "L", enabled: true };
  assert.match(validateForm({ ...base, endDate: "2026-12-02" }) ?? "", /mois/);
  assert.match(validateForm({ ...base, startDate: "2026-11-20", endDate: "2026-11-10" }) ?? "", /avant/);
  assert.match(validateForm({ ...base, startDate: "2026-11-01", endDate: "2026-11-03", targetDays: "4" }) ?? "", /3 jours/);
  assert.match(validateForm({ ...base, targetDays: "0" }) ?? "", /au moins 1/);
  assert.match(validateForm({ ...base, title: "" }) ?? "", /obligatoires/);
  assert.equal(validateForm({ ...base, title: "", enabled: false }), null);
});

test("relecture : dates au jour de Paris et partenaire depuis son chemin", () => {
  const form = formFromConfig({
    enabled: true, title: "Défi", prize_title: "Bon", prize_value: 50, target_days: 8,
    start_date: seconds("2026-10-31T23:00:00Z"), end_date: seconds("2026-11-29T23:00:00Z"),
    enseigne_ref: "enseignes/shop1",
  }, "merchant", "2026-11");
  assert.equal(form.startDate, "2026-11-01");
  assert.equal(form.endDate, "2026-11-30");
  assert.equal(form.partnerShopId, "shop1");
  assert.equal(form.targetDays, "8");
  assert.equal(form.prizeValue, "50");
});

test("statut et verrouillage : un défi commencé n'est arrêtable que par annulation", () => {
  const start = Date.parse("2026-11-01T00:00:00+01:00");
  const draw = Date.parse("2026-12-01T00:00:00+01:00");
  const state = stateFromConfig({ enabled: true, updated_at: {}, start_date: { _seconds: start / 1000 }, draw_date: { _seconds: draw / 1000 } });
  assert.equal(challengeStatus(state, start - 1), "scheduled");
  assert.equal(isLocked(state, start - 1), false);
  assert.equal(challengeStatus(state, start + 1), "running");
  assert.equal(isLocked(state, start + 1), true);
  assert.equal(challengeStatus(state, draw + 1), "awaiting_draw");
  assert.equal(isLocked(state, draw + 1), true);
  assert.equal(challengeStatus({ ...state, drawStatus: "completed" }, draw + 1), "drawn");
  assert.equal(isLocked({ ...state, drawStatus: "completed" }, draw + 1), false);
  assert.equal(challengeStatus({ ...state, enabled: false, cancelled: true }, start + 1), "cancelled");
  assert.equal(challengeStatus({ ...state, enabled: false }, start + 1), "draft");
});
