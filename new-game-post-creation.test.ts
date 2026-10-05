import test from "node:test";
import assert from "node:assert/strict";
import {
  getNewGamePostCreationRoute,
  shouldOfferInstantWinnerGeneration,
} from "./lib/admin/newGamePostCreation";

test("un jeu sans lot secondaire revient directement a la liste du commercant", () => {
  assert.equal(getNewGamePostCreationRoute("merchant 42"), "/admin/games?merchantId=merchant%2042");
  assert.equal(shouldOfferInstantWinnerGeneration(0), false);
});

test("un jeu avec lots secondaires propose leur generation apres creation", () => {
  assert.equal(shouldOfferInstantWinnerGeneration(1), true);
  assert.equal(shouldOfferInstantWinnerGeneration(8), true);
});
