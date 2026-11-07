import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { merchantDeliveryInfo, planGameFulfillment, resolveShopOwner } from "./lib/admin/gameFulfillment";

const owned = { kind: "owner", ownerPath: "users/u1" } as const;
const none = { kind: "none" } as const;

test("commerce avec compte : le commercant garde le modele merchant, ProxiPlay donne platform, fiche intacte", () => {
  assert.deepEqual(planGameFulfillment({ owner: owned, deliverer: "commercant", shop: {}, partnerEmail: "" }),
    { fulfillmentType: "merchant", shopPatch: {} });
  assert.deepEqual(planGameFulfillment({ owner: owned, deliverer: "proxiplay", shop: { email: "a@b.fr" }, partnerEmail: "x@y.fr" }),
    { fulfillmentType: "platform", shopPatch: {} });
});

test("commerce sans compte, remise ProxiPlay : platform et gestion admin, sans e-mail requis", () => {
  assert.deepEqual(planGameFulfillment({ owner: none, deliverer: "proxiplay", shop: {}, partnerEmail: "" }),
    { fulfillmentType: "platform", shopPatch: { managed_by_admin: true } });
  assert.deepEqual(planGameFulfillment({ owner: none, deliverer: "proxiplay", shop: { managed_by_admin: true }, partnerEmail: "" }),
    { fulfillmentType: "platform", shopPatch: {} });
});

test("commerce sans compte, remise commercant : l'e-mail de la fiche est utilise et jamais remplace", () => {
  assert.deepEqual(planGameFulfillment({ owner: none, deliverer: "commercant", shop: { email: " Remise@Exemple.fr " }, partnerEmail: "" }),
    { fulfillmentType: "partner", shopPatch: { managed_by_admin: true } });
  assert.deepEqual(planGameFulfillment({ owner: none, deliverer: "commercant", shop: { email: "remise@exemple.fr", managed_by_admin: true }, partnerEmail: "REMISE@exemple.fr" }),
    { fulfillmentType: "partner", shopPatch: {} });
  assert.throws(() => planGameFulfillment({ owner: none, deliverer: "commercant", shop: { email: "remise@exemple.fr" }, partnerEmail: "autre@exemple.fr" }),
    /déjà l'adresse remise@exemple\.fr/);
  assert.throws(() => planGameFulfillment({ owner: none, deliverer: "commercant", shop: { email: "pas-un-email" }, partnerEmail: "ok@exemple.fr" }),
    /fiche commerçant \(pas-un-email\) est invalide/);
});

test("commerce sans compte ni e-mail : e-mail obligatoire et valide, enregistre sur la fiche", () => {
  for (const partnerEmail of ["", "  ", "invalide", "a@b"]) {
    assert.throws(() => planGameFulfillment({ owner: none, deliverer: "commercant", shop: {}, partnerEmail }), /adresse e-mail valide/);
  }
  assert.deepEqual(planGameFulfillment({ owner: none, deliverer: "commercant", shop: { email: "" }, partnerEmail: " Remise@Exemple.fr " }),
    { fulfillmentType: "partner", shopPatch: { managed_by_admin: true, email: "remise@exemple.fr" } });
});

test("proprietaire incoherent ou choix absent : creation refusee", () => {
  assert.throws(() => planGameFulfillment({ owner: { kind: "invalid" }, deliverer: "proxiplay", shop: {}, partnerEmail: "" }), /incohérent/);
  assert.throws(() => planGameFulfillment({ owner: none, deliverer: undefined as never, shop: {}, partnerEmail: "" }), /qui remet le lot/);
});

test("la resolution du proprietaire reprend shopOwnerPath des Functions", () => {
  const ref = (path: string) => ({ path });
  assert.deepEqual(resolveShopOwner({}), { kind: "none" });
  assert.deepEqual(resolveShopOwner({ owner: null, owner_id: null }), { kind: "none" });
  assert.deepEqual(resolveShopOwner({ owner_id: ref("users/u1") }), { kind: "owner", ownerPath: "users/u1" });
  assert.deepEqual(resolveShopOwner({ owner: "/users/u1" }), { kind: "owner", ownerPath: "users/u1" });
  // Un uid nu est un compte pour les Functions : ne jamais le traiter comme sans compte.
  assert.deepEqual(resolveShopOwner({ owner: "u1" }), { kind: "owner", ownerPath: "users/u1" });
  assert.deepEqual(resolveShopOwner({ owner_id: ref("users/u1"), owner: "/users/u1" }), { kind: "owner", ownerPath: "users/u1" });
  // Identites malformees ou contradictoires : bloquees, jamais "sans compte".
  assert.deepEqual(resolveShopOwner({ owner_id: ref("enseignes/x") }), { kind: "invalid" });
  assert.deepEqual(resolveShopOwner({ owner_id: ref("users/u1"), owner: "/users/u2" }), { kind: "invalid" });
  assert.deepEqual(resolveShopOwner({ owner: "" }), { kind: "invalid" });
  assert.deepEqual(merchantDeliveryInfo({ owner_id: ref("enseignes/x"), email: " a@b.fr " }),
    { hasMerchantOwner: false, ownerInvalid: true, email: "a@b.fr" });
});

test("le createGame reellement compile (alias) applique le plan et ne touche pas aux statuts", () => {
  const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
  assert.deepEqual(tsconfig.compilerOptions.paths["@/lib/firebase/gamesQueries"], ["./lib/firebase/gamesQueriesFixed.ts"]);

  const fixed = readFileSync("lib/firebase/gamesQueriesFixed.ts", "utf8");
  const create = fixed.slice(fixed.indexOf("export async function createGame"), fixed.indexOf("function timestampFromSource"));
  assert.match(create, /resolveShopOwner\(merchantData\)/);
  assert.match(create, /planGameFulfillment\(/);
  assert.match(create, /fulfillment_type: fulfillment\.fulfillmentType/);
  assert.match(create, /fulfillment\.fulfillmentType === "partner" \? \{ partner_delivery_enabled: true \}/);
  assert.match(create, /batch\.update\(merchantRef, fulfillment\.shopPatch\)/);
  assert.match(create, /batch\.set\(gameRef, payload\)/);
  assert.doesNotMatch(create, /setDoc\(gameRef/);
  assert.doesNotMatch(create, /owner_id:/, "aucun proprietaire n'est invente");
  const plan = readFileSync("lib/admin/gameFulfillment.ts", "utf8");
  assert.doesNotMatch(plan, /status/);

  // Le createGame de gamesQueries.ts est masque par l'alias : il ne doit pas diverger silencieusement.
  const legacy = readFileSync("lib/firebase/gamesQueries.ts", "utf8");
  assert.doesNotMatch(legacy, /fulfillment_type|managed_by_admin/);

  const duplicate = fixed.slice(fixed.indexOf("export async function duplicateGameDocument"));
  assert.match(duplicate, /fulfillment_type: source\.fulfillment_type/);
  assert.match(duplicate, /partner_delivery_enabled: true/);

  const form = readFileSync("app/admin/games/NewGameForm.tsx", "utf8");
  assert.match(form, /Qui remet le lot \?/);
  assert.match(form, /prizeDeliverer: form\.prizeDeliverer/);
});
