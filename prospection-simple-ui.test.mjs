import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("accueil Prospection : une interface unifiée avec tableau de bord et navigation", () => {
  const home = readFileSync("app/admin/prospection/page.tsx", "utf8");
  const unified = readFileSync("app/admin/prospection/avance/page.tsx", "utf8");
  assert.match(home, /UnifiedProspectionPage/);
  for (const label of ["Tableau de bord", "Prospects", "Recherche", "Campagnes", "Actions du jour", "Actions prioritaires", "Emails exploitables", "Relances dues"]) assert.match(unified, new RegExp(label));
  assert.match(unified, /setSettingsOpen/);
});
