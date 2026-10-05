import test from "node:test";
import assert from "node:assert/strict";
import { resolveCreateGameDescriptions } from "./lib/firebase/gameDescriptions";
import { buildCreateGameDescriptionPayload } from "./lib/firebase/gamesQueries";

test("un jeu QR conserve sa description distincte du lot principal", () => {
  assert.deepEqual(
    resolveCreateGameDescriptions({
      accessMode: "qr_only",
      gameDescription: "Rencontrez-nous au salon.",
      mainPrizeDescription: "Un panier garni",
    }),
    { gameDescription: "Rencontrez-nous au salon.", mainPrizeDescription: "Un panier garni" },
  );
});

test("un jeu classique conserve le comportement historique", () => {
  assert.deepEqual(
    resolveCreateGameDescriptions({
      accessMode: "public",
      gameDescription: "Texte non utilise",
      mainPrizeDescription: "Une reduction de 10%",
    }),
    { gameDescription: "Une reduction de 10%", mainPrizeDescription: "Une reduction de 10%" },
  );
});

test("le payload reel de creation QR garde la description distincte du lot", () => {
  const payload = buildCreateGameDescriptionPayload({
    accessMode: "qr_only",
    gameDescription: "Retrouvez Primo Dunkerque au Salon de l’Habitat",
    mainPrizeDescription: "Une bouteille de champagne",
    hasMainPrize: true,
    prizeValue: null,
  });

  assert.equal(payload.description, "Retrouvez Primo Dunkerque au Salon de l’Habitat");
  assert.equal(payload.main_prize_description, "Une bouteille de champagne");
  assert.notEqual(payload.description, payload.main_prize_description);
});
