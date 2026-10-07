import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("la relance conserve les etapes brouillon, generation et publication separees", () => {
  const page = readFileSync("app/admin/games/page.tsx", "utf8");
  const modal = readFileSync("components/admin/jeux/GameEditModal.tsx", "utf8");
  const queries = readFileSync("lib/firebase/gamesQueriesFixed.ts", "utf8");

  assert.match(queries, /relaunch_workflow: true/);
  assert.match(queries, /instant_winners_ready: false/);
  assert.doesNotMatch(queries, /prize_usage_deadline/);
  assert.doesNotMatch(queries, /start_date,/);
  assert.doesNotMatch(queries, /end_date,/);
  assert.match(modal, /disabled=\{saving \|\| backfillLoading \|\| formDirty\}/);
  assert.match(page, /Generez les lots instantanes avant de publier ce brouillon/);
  assert.match(page, /"Enregistrer le brouillon"/);
  assert.match(page, /"Publier le jeu"/);
  assert.doesNotMatch(page, /false && isRelaunch/);
  assert.match(modal, /Les dates de début et de fin sont obligatoires avant publication/);
  assert.match(modal, /La date de fin doit être dans le futur avant publication/);
});
