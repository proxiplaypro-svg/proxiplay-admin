import test from "node:test";
import assert from "node:assert/strict";
import { resolveCreateGameDescriptions } from "./lib/firebase/gameDescriptions";

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
