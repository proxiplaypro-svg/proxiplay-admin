import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("accueil Prospection : trois étapes commerciales simples", () => {
  const home = readFileSync("app/admin/prospection/page.tsx", "utf8");
  const unified = readFileSync("app/admin/prospection/avance/page.tsx", "utf8");
  assert.match(home, /UnifiedProspectionPage/);
  for (const label of ["RECHERCHER DES MAILS", "CONTACTER", "SUIVI", "Avec e-mail", "Sans e-mail", "Contacter la sélection", "Rechercher les e-mails manquants", "Suivi commercial"]) assert.match(unified, new RegExp(label));
  assert.doesNotMatch(unified, /Tableau de bord|Campagnes & suivi|Variantes de campagne/);
  assert.match(unified, /selected.*Set/);
});
