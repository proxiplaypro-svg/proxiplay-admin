import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deliveryType, gameOwnerPath, partnerDeliveryEnabled } from "./gameOwnership";

test("Admin game contract resolves merchant, partner and platform", () => {
  const merchant = { owner_id: { path: "users/merchant" } };
  const ownerless = { managed_by_admin: true, email: "partner@example.test" };
  assert.equal(gameOwnerPath(merchant), "users/merchant");
  assert.equal(deliveryType(merchant, "merchant"), "merchant");
  assert.equal(gameOwnerPath(ownerless), null);
  assert.equal(deliveryType(ownerless, "merchant"), "partner");
  assert.equal(deliveryType(ownerless, "platform"), "platform");
});

test("NewGameForm forwards the selected principal delivery", () => {
  const source = readFileSync(new URL("../../app/admin/games/NewGameForm.tsx", import.meta.url), "utf8");
  assert.match(source, /createGame\(\{\s*fulfillmentType:\s*form\.fulfillmentType,/);
});

test("partner delivery is opt-in and validates the partner email only when enabled", () => {
  const partner = { managed_by_admin: true, email: "partner@example.test" };
  assert.equal(partnerDeliveryEnabled(partner, "merchant", true), false);
  assert.equal(partnerDeliveryEnabled(partner, "platform", true), false);
  assert.equal(partnerDeliveryEnabled(partner, "partner", false), false);
  assert.equal(partnerDeliveryEnabled(partner, "partner", true), true);
  assert.throws(() => partnerDeliveryEnabled({ managed_by_admin: true }, "partner", true), /email partenaire valide/);
  assert.throws(() => partnerDeliveryEnabled({ managed_by_admin: true, email: "invalid" }, "partner", true), /email partenaire valide/);
});

test("game writers persist an explicit new-game flag and preserve historical untouched games", () => {
  const queries = readFileSync(new URL("../firebase/gamesQueries.ts", import.meta.url), "utf8");
  const fixed = readFileSync(new URL("../firebase/gamesQueriesFixed.ts", import.meta.url), "utf8");
  const modal = readFileSync(new URL("../../components/admin/jeux/GameEditModal.tsx", import.meta.url), "utf8");
  assert.match(queries, /partner_delivery_enabled: input\.partnerDeliveryEnabled/);
  assert.match(queries, /partner_delivery_enabled: false/);
  assert.match(fixed, /partner_delivery_enabled: input\.partnerDeliveryEnabled/);
  assert.match(fixed, /partner_delivery_enabled: false/);
  assert.match(modal, /partnerDeliveryConfigured: game\?\.partnerDeliveryEnabled !== undefined/);
});
