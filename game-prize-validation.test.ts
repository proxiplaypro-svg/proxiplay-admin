import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMainPrizeRemovalFields,
  buildMainPrizeWriteFields,
  resolveHasMainPrize,
  validateGamePrizes,
} from "./lib/firebase/gamePrizeValidation";

test("principal seul est accepte", () => {
  assert.equal(validateGamePrizes({ hasMainPrize: true, mainPrizeDescription: "Un cadeau", secondaryPrizes: [] }), null);
});

test("principal et gains instantanes sont acceptes", () => {
  assert.equal(validateGamePrizes({ hasMainPrize: true, mainPrizeDescription: "Un cadeau", secondaryPrizes: [{ name: "Bon", count: "2" }] }), null);
});

test("gains instantanes seuls sont acceptes", () => {
  assert.equal(validateGamePrizes({ hasMainPrize: false, mainPrizeDescription: "", secondaryPrizes: [{ name: "Bon", count: "10" }] }), null);
});

test("un jeu sans aucun lot est refuse", () => {
  assert.equal(
    validateGamePrizes({ hasMainPrize: false, mainPrizeDescription: "", secondaryPrizes: [] }),
    "Ajoutez au moins un lot principal ou un gain instantané.",
  );
});

test("sans lot principal, aucun champ principal n est ecrit et les anciens champs sont supprimes", () => {
  assert.deepEqual(buildMainPrizeWriteFields(false, { prize_value: 10, main_prize_title: "Lot" }), {});
  const deleted = Symbol("deleteField");
  assert.deepEqual(buildMainPrizeRemovalFields(deleted), {
    prize_value: deleted,
    main_prize_title: deleted,
    main_prize_description: deleted,
    main_prize_image: deleted,
  });
});

test("le booleen explicite est souverain et le fallback legacy utilise prize_value seulement", () => {
  assert.equal(resolveHasMainPrize(true, null), true);
  assert.equal(resolveHasMainPrize(false, 10), false);
  assert.equal(resolveHasMainPrize(undefined, 10), true);
  assert.equal(resolveHasMainPrize(undefined, null), false);
});
