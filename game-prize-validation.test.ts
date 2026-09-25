import test from "node:test";
import assert from "node:assert/strict";
import { validateGamePrizes } from "./lib/firebase/gamePrizeValidation";

test("principal seul est accepte", () => {
  assert.equal(
    validateGamePrizes({ hasMainPrize: true, mainPrizeDescription: "Un cadeau", secondaryPrizes: [] }),
    null,
  );
});

test("principal et gains instantanes sont acceptes", () => {
  assert.equal(
    validateGamePrizes({ hasMainPrize: true, mainPrizeDescription: "Un cadeau", secondaryPrizes: [{ name: "Bon", count: "2" }] }),
    null,
  );
});

test("gains instantanes seuls sont acceptes", () => {
  assert.equal(
    validateGamePrizes({ hasMainPrize: false, mainPrizeDescription: "", secondaryPrizes: [{ name: "Bon", count: "10" }] }),
    null,
  );
});

test("un jeu sans aucun lot est refuse", () => {
  assert.equal(
    validateGamePrizes({ hasMainPrize: false, mainPrizeDescription: "", secondaryPrizes: [] }),
    "Ajoutez au moins un lot principal ou un gain instantané.",
  );
});