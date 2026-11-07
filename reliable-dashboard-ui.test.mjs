import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("components/admin/ReliableDashboard.tsx", "utf8");

test("the simplified dashboard contains only the seven requested cards", () => {
  for (const label of ["Joueurs inscrits", "Joueurs uniques", "Joueurs inactifs", "Parties jouées hier", "Parties jouées depuis le lancement", "Jeux en cours"]) assert.match(source, new RegExp(label));
  for (const removed of ["Enseignes avec jeu", "Joueurs quotidiens", "Parties quotidiennes", "DAU", "Rétention"]) assert.doesNotMatch(source, new RegExp(removed));
  assert.match(source, /min-\[420px\]:grid-cols-2/);
  assert.match(source, /xl:grid-cols-3/);
  assert.match(source, /Indisponible/);
});
