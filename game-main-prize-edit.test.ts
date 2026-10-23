import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMainPrizeEditFields, resolveMainPrizeFields, validateGamePrizes } from "./lib/firebase/gamePrizeValidation";

test("édition et activation enregistrent les deux champs séparés, même vides", () => {
  const remove = Symbol("delete");
  assert.deepEqual(buildMainPrizeEditFields(true, " Lot ", "", remove), {
    main_prize_title: "Lot", main_prize_description: "",
  });
  assert.deepEqual(buildMainPrizeEditFields(true, "", " Description ", remove), {
    main_prize_title: "", main_prize_description: "Description",
  });
  assert.equal(validateGamePrizes({ hasMainPrize: true, mainPrizeDescription: "Lot", secondaryPrizes: [] }), null);
});

test("désactivation supprime les champs, y compris pour un jeu QR", () => {
  const remove = Symbol("delete");
  assert.deepEqual(buildMainPrizeEditFields(false, "Lot", "Description", remove), {
    main_prize_title: remove, main_prize_description: remove, main_prize_image: remove,
  });
});

test("édition historique et champs explicitement vides restent distincts", () => {
  assert.deepEqual(resolveMainPrizeFields({ name: "CycloBart", description: "Description historique" }), {
    mainPrizeTitle: "CycloBart", mainPrizeDescription: "Description historique",
  });
  assert.deepEqual(resolveMainPrizeFields({
    name: "Jeu", description: "Description générale", main_prize_title: "", main_prize_description: null,
  }), { mainPrizeTitle: "", mainPrizeDescription: "" });
});

test("le formulaire expose et utilise les champs dédiés", () => {
  const page = readFileSync("app/admin/games/[gameId]/edit/page.tsx", "utf8");
  assert.match(page, /value=\{form\.mainPrizeTitle\}/);
  assert.match(page, /value=\{form\.mainPrizeDescription\}/);
  assert.match(page, /buildMainPrizeEditFields\(/);
});
