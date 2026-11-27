import assert from "node:assert/strict";
import test from "node:test";
import { merchantCgvLabel, readMerchantCgvStatus } from "./lib/admin/merchantCgv";

test("libellé : non acceptées sans version", () => {
  assert.equal(merchantCgvLabel(null), "CGV non acceptées");
  assert.equal(merchantCgvLabel({ cgvAcceptedVersion: null, cgvAcceptedAt: null }), "CGV non acceptées");
  assert.equal(merchantCgvLabel({ cgvAcceptedVersion: "  ", cgvAcceptedAt: "2026-12-01T09:05:00Z" }), "CGV non acceptées");
});

test("libellé : version et date à l'heure de Paris (hiver et été)", () => {
  assert.equal(merchantCgvLabel({ cgvAcceptedVersion: "2.1", cgvAcceptedAt: "2026-12-01T09:05:00Z" }), "CGV v2.1 acceptées le 01/12/2026 à 10:05");
  assert.equal(merchantCgvLabel({ cgvAcceptedVersion: "2.1", cgvAcceptedAt: "2027-07-14T22:30:00Z" }), "CGV v2.1 acceptées le 15/07/2027 à 00:30");
});

test("lecture de la trace history : Timestamp converti en ISO, champs absents à null", () => {
  const at = new Date("2026-12-01T09:05:00Z");
  assert.deepEqual(readMerchantCgvStatus({ cgv_version: "2.1", accepted_at: { toDate: () => at } }), { cgvAcceptedVersion: "2.1", cgvAcceptedAt: at.toISOString() });
  assert.deepEqual(readMerchantCgvStatus({ cgv_accepted_version: "2.1" }), { cgvAcceptedVersion: null, cgvAcceptedAt: null });
  assert.deepEqual(readMerchantCgvStatus({}), { cgvAcceptedVersion: null, cgvAcceptedAt: null });
  assert.deepEqual(readMerchantCgvStatus(undefined), { cgvAcceptedVersion: null, cgvAcceptedAt: null });
});
