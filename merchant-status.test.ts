import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isMerchantValidated, merchantValidation } from "./lib/admin/merchantStatus";

test("statuts de validation : libellés, anciennes valeurs signalées, valeurs inconnues conservées", () => {
  assert.deepEqual(merchantValidation("approved"), { status: "approved", label: "Validé", legacy: false });
  assert.deepEqual(merchantValidation("pendingValidation"), { status: "pendingValidation", label: "En attente de validation", legacy: false });
  assert.deepEqual(merchantValidation("rejected"), { status: "rejected", label: "Refusé", legacy: false });
  assert.deepEqual(merchantValidation("suspended"), { status: "suspended", label: "Suspendu", legacy: false });
  assert.deepEqual(merchantValidation("active"), { status: "active", label: "Statut à régulariser (ancien : active)", legacy: true });
  assert.deepEqual(merchantValidation(" inactive "), { status: "inactive", label: "Statut à régulariser (ancien : inactive)", legacy: true });
  assert.deepEqual(merchantValidation("Approved"), { status: "Approved", label: "Statut inconnu (Approved)", legacy: false });
  for (const empty of [undefined, null, "", 3]) assert.deepEqual(merchantValidation(empty), { status: "", label: "Non renseigné", legacy: false });
});

test("compte validé pour ouvrir une nouvelle enseigne : approved, ou ancien active", () => {
  for (const status of ["approved", "active"]) assert.equal(isMerchantValidated(status), true);
  for (const status of ["pendingValidation", "rejected", "suspended", "inactive", "", undefined, "APPROVED"]) assert.equal(isMerchantValidated(status), false);
});

test("fiche joueur : account_status jamais écrit, champ en lecture seule", () => {
  const source = readFileSync("app/admin/joueurs/[userId]/page.tsx", "utf8");
  const save = source.slice(source.indexOf("const handleEditSave"), source.indexOf("setFeedback(\"Profil joueur mis a jour.\")"));
  assert.ok(save.includes("updateDoc("), "enregistrement localisé");
  assert.doesNotMatch(save, /account_status\s*:/);
  assert.doesNotMatch(source, /accountStatus:\s*event\.target\.value/);
  assert.match(source, /value=\{editForm\.accountStatus\}\s*readOnly/);
});
