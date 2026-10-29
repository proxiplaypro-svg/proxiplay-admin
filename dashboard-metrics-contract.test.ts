import test from "node:test";
import assert from "node:assert/strict";
import * as contract from "./shared/dashboardMetricsContract";
import { gamePublicationState as adminPublicationState } from "./lib/admin/gamePublication";

const NOW = Date.parse("2026-10-20T12:00:00.000Z");
const DAY = 86_400_000;
const running = { visible_public: true, start_date: new Date(NOW - DAY), end_date: new Date(NOW + DAY) };

test("eligible registered players use explicit test and deletion flags only", () => {
  for (const status of ["active", "inactive", "approved", "pendingValidation", "pendingInfo", "rejected"]) {
    assert.equal(contract.isEligibleRegisteredPlayer({ user_role: "joueur", status }), true, status);
  }
  assert.equal(contract.isEligibleRegisteredPlayer({ user_role: "commercant" }), false);
  assert.equal(contract.isEligibleRegisteredPlayer({ user_role: "admin" }), false);
  assert.equal(contract.isEligibleRegisteredPlayer({ user_role: "joueur", is_test_account: true }), false);
  assert.equal(contract.isEligibleRegisteredPlayer({ user_role: "joueur", is_deleted: true }), false);
  assert.equal(contract.isEligibleRegisteredPlayer({ user_role: "joueur" }), true);
});

test("participation date accepts Firestore Timestamp-like and Date values, not missing or invalid data", () => {
  assert.equal(contract.isParticipationInRolling30Days({ participation_date: { toMillis: () => NOW - DAY } }, NOW), true);
  assert.equal(contract.isParticipationInRolling30Days({ participation_date: new Date(NOW - DAY) }, NOW), true);
  assert.equal(contract.isParticipationInRolling30Days({}, NOW), false);
  assert.equal(contract.isParticipationInRolling30Days({ participation_date: new Date("invalid") }, NOW), false);
  assert.equal(contract.isParticipationInRolling30Days({ participation_date: NOW - 30 * DAY }, NOW), true);
  assert.equal(contract.isParticipationInRolling30Days({ participation_date: NOW - 30 * DAY - 1 }, NOW), false);
  assert.equal(contract.isParticipationInRolling30Days({ participation_date: NOW + 1 }, NOW), false);
});

test("Paris day key handles DST boundaries and late processing uses participation date", () => {
  assert.equal(contract.parisDayKey(Date.parse("2026-03-29T00:30:00Z")), "2026-03-29");
  assert.equal(contract.parisDayKey(Date.parse("2026-10-25T01:30:00Z")), "2026-10-25");
  assert.equal(contract.parisDayKey(Date.parse("2026-03-28T23:30:00Z")), "2026-03-29");
  assert.equal(contract.parisDayKey(new Date("invalid")), null);
});

test("merchant identity favours enseigne references and normalises historical ids", () => {
  assert.equal(contract.merchantIdentity({ enseigne_id: { path: "enseignes/a" }, merchantId: "b" }), "enseignes/a");
  assert.equal(contract.merchantIdentity({ enseigne_id: { id: "a" } }), "enseignes/a");
  assert.equal(contract.merchantIdentity({ merchant_id: "legacy" }), "enseignes/legacy");
  assert.equal(contract.merchantIdentity({}), null);
});

test("shared publication table remains aligned with current Admin publication rule", () => {
  const cases = [
    {}, { visible_public: true, status: "actif" }, { visible_public: false, status: "brouillon" },
    { visible_public: false, participations: 20 }, { deleted: true },
    { visible_public: false, visible_public_auto_published: true },
  ];
  for (const game of cases) assert.equal(contract.gamePublicationState(game), adminPublicationState(game));
});

test("game access distinguishes public, dates, publication states and secure QR proof", () => {
  assert.deepEqual(contract.gameInProgress(running, { now: NOW }), { state: "playable", reason: "public" });
  assert.deepEqual(contract.gameInProgress({ ...running, start_date: new Date(NOW + 1) }, { now: NOW }), { state: "not_playable", reason: "not_started" });
  assert.deepEqual(contract.gameInProgress({ ...running, end_date: new Date(NOW) }, { now: NOW }), { state: "not_playable", reason: "ended" });
  assert.deepEqual(contract.gameInProgress({ ...running, visible_public: false }, { now: NOW }), { state: "not_playable", reason: "draft" });
  assert.deepEqual(contract.gameInProgress({ ...running, deleted: true }, { now: NOW }), { state: "not_playable", reason: "disabled" });
  assert.deepEqual(contract.gameInProgress({ ...running, visible_public: false, visible_public_auto_published: true }, { now: NOW }), { state: "not_playable", reason: "hidden" });
  const qr = { ...running, access_mode: "qr_only", isPrivate: true };
  assert.deepEqual(contract.gameInProgress(qr, { now: NOW, qrAccessState: "ready" }), { state: "playable", reason: "qr_access_ready" });
  assert.deepEqual(contract.gameInProgress(qr, { now: NOW }), { state: "indeterminate", reason: "qr_access_not_checked" });
  assert.deepEqual(contract.gameInProgress(qr, { now: NOW, qrAccessState: "missing" }), { state: "not_playable", reason: "qr_missing" });
  assert.deepEqual(contract.gameInProgress({ visible_public: true }, { now: NOW }), { state: "indeterminate", reason: "missing_dates" });
});
