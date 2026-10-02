import assert from "node:assert/strict";
import test from "node:test";
import { commercialCategory, commercialEmailAction, FOLLOW_UP_DELAY_MS } from "./lib/prospection/list";
import type { ProspectStatus } from "./lib/prospection/model";

const at = Date.parse("2026-10-02T12:00:00.000Z");
const category = (status: ProspectStatus, last_contact_at: string | null = null) => commercialCategory({ status, last_contact_at }, at);
for (const [name, status, lastContact, expected] of [["new", "new", null, "new"], ["to_contact", "to_contact", null, "to_contact"], ["contacted J+1", "contacted", new Date(at - 86400000).toISOString(), "contacted"], ["contacted J+6", "contacted", new Date(at - 6 * 86400000).toISOString(), "contacted"], ["contacted exactement J+7", "contacted", new Date(at - FOLLOW_UP_DELAY_MS).toISOString(), "follow_up"], ["contacted J+8", "contacted", new Date(at - 8 * 86400000).toISOString(), "follow_up"], ["contacted sans last_contact_at", "contacted", null, "contacted"], ["follow_up historique", "follow_up", null, "follow_up"], ["replied", "replied", null, "replied"], ["meeting", "meeting", null, "meeting"], ["client", "client", null, "client"], ["rejected", "rejected", null, "rejected"]] as const) test(name, () => assert.equal(category(status, lastContact), expected));
test("catégories exclusives : compteur et liste utilisent la même catégorisation", () => { const values = [category("contacted", new Date(at - 86400000).toISOString()), category("contacted", new Date(at - FOLLOW_UP_DELAY_MS).toISOString()), category("follow_up")]; assert.equal(values.filter(value => value === "contacted").length, 1); assert.equal(values.filter(value => value === "follow_up").length, 2); });
test("actions : email initial avant contact, relance seulement quand relançable", () => {
  assert.equal(commercialEmailAction({ status: "new", last_contact_at: null }, true, at), "initial");
  assert.equal(commercialEmailAction({ status: "to_contact", last_contact_at: null }, true, at), "initial");
  assert.equal(commercialEmailAction({ status: "contacted", last_contact_at: new Date(at - 86400000).toISOString() }, true, at), null);
  assert.equal(commercialEmailAction({ status: "contacted", last_contact_at: new Date(at - FOLLOW_UP_DELAY_MS).toISOString() }, true, at), "follow_up");
  assert.equal(commercialEmailAction({ status: "replied", last_contact_at: null }, true, at), null);
  assert.equal(commercialEmailAction({ status: "meeting", last_contact_at: null }, true, at), null);
  assert.equal(commercialEmailAction({ status: "client", last_contact_at: null }, true, at), null);
  assert.equal(commercialEmailAction({ status: "rejected", last_contact_at: null }, true, at), null);
});
