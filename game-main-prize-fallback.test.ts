import test from "node:test";
import assert from "node:assert/strict";
import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { mapGameDocument } from "./lib/firebase/gamesQueries";
import { validateGamePrizes } from "./lib/firebase/gamePrizeValidation";

// Regression: the mobile app (createGamesRecordData in games_record.dart)
// never writes main_prize_title/main_prize_description -- it has no such
// parameters, only name/description/prizeValue/hasMainPrize. A merchant
// game with a main prize created from the app therefore always has these
// two fields absent in Firestore. mapGameDocument used to read them with
// no fallback, so Game.mainPrizeTitle/mainPrizeDescription came back
// empty for such a game -- which made validateGamePrizes() refuse to
// relaunch it ("Le lot principal est obligatoire...") even though
// hasMainPrize/prize_value were both correct. Real case: "Une paire de
// bas" / Fonteyne Lingerie, duplicated from the admin.
//
// Fixed by falling back to the game's own title/name and
// description/conditions -- exactly what the mobile app already uses as
// the de facto prize text.

function fakeSnapshot(id: string, data: Record<string, unknown>): QueryDocumentSnapshot<DocumentData> {
  return {
    id,
    data: () => data,
  } as unknown as QueryDocumentSnapshot<DocumentData>;
}

const merchants = new Map();

test("1. jeu cree par l'Admin avec main_prize_title : cette valeur reste prioritaire", () => {
  const source = {
    name: "Jeu generique",
    title: "Jeu generique",
    description: "Description generale du jeu",
    hasMainPrize: true,
    prize_value: 25,
    main_prize_title: "Panier gourmand",
    main_prize_description: "Un vrai panier gourmand",
  };
  const game = mapGameDocument(fakeSnapshot("admin_game", source), "games", merchants);

  assert.equal(game.mainPrizeTitle, "Panier gourmand");
  assert.equal(game.mainPrizeDescription, "Un vrai panier gourmand");
});

test("2. jeu mobile (hasMainPrize:true, sans main_prize_title, name:'Une paire de bas') : " +
  "mainPrizeTitle retombe sur le nom du jeu", () => {
  const source = {
    name: "Une paire de bas",
    title: "Une paire de bas",
    description: "",
    hasMainPrize: true,
    prize_value: 25,
    // Pas de main_prize_title / main_prize_description : exactement ce
    // que createGamesRecordData() ecrit depuis le mobile.
  };
  const game = mapGameDocument(fakeSnapshot("mobile_game", source), "games", merchants);

  assert.equal(game.mainPrizeTitle, "Une paire de bas");
});

test("3. meme principe pour mainPrizeDescription : retombe sur la description du jeu, " +
  "puis sur conditions si la description est vide", () => {
  const withDescription = mapGameDocument(
    fakeSnapshot("mobile_game_desc", {
      name: "Une paire de bas",
      description: "Lingerie fine offerte",
      hasMainPrize: true,
      prize_value: 25,
    }),
    "games",
    merchants,
  );
  assert.equal(withDescription.mainPrizeDescription, "Lingerie fine offerte");

  const withConditionsOnly = mapGameDocument(
    fakeSnapshot("mobile_game_conditions", {
      name: "Une paire de bas",
      conditions: "Valable en boutique uniquement",
      hasMainPrize: true,
      prize_value: 25,
    }),
    "games",
    merchants,
  );
  assert.equal(withConditionsOnly.mainPrizeDescription, "Valable en boutique uniquement");
});

test("4/5. le jeu mobile mappe possede un lot principal valide, " +
  "et validateGamePrizes() l'accepte comme le ferait duplicateGameDocument()", () => {
  // duplicateGameDocument() (gamesQueries.ts) copie textuellement
  // original.mainPrizeTitle/original.mainPrizeDescription -- le Game deja
  // mappe -- dans le document duplique (main_prize_title:
  // original.mainPrizeTitle). Avec le correctif, "original" ci-dessous a
  // deja un titre/description non vides, donc la copie en aura aussi.
  const original = mapGameDocument(
    fakeSnapshot("fonteyne_source", {
      name: "Une paire de bas",
      description: "",
      hasMainPrize: true,
      prize_value: 25,
    }),
    "games",
    merchants,
  );

  const duplicatedMainPrizeTitle = original.mainPrizeTitle;
  const duplicatedMainPrizeDescription = original.mainPrizeDescription;
  assert.ok(duplicatedMainPrizeTitle, "la copie doit avoir un titre de lot principal non vide");

  // Exactement l'appel fait par GameEditModal.handleSubmit() avant
  // d'autoriser "Relancer le jeu".
  const error = validateGamePrizes({
    hasMainPrize: true,
    mainPrizeDescription: duplicatedMainPrizeTitle || duplicatedMainPrizeDescription,
    secondaryPrizes: [],
  });
  assert.equal(error, null, "la copie ne doit plus declencher " +
    "'Le lot principal est obligatoire lorsque le tirage final est active.'");
});

test("6. jeu sans lot principal : aucun comportement parasite", () => {
  const game = mapGameDocument(
    fakeSnapshot("instant_only_game", {
      name: "Jeu instantane",
      description: "Tentez votre chance",
      hasMainPrize: false,
    }),
    "games",
    merchants,
  );

  // Le repli peuple quand meme mainPrizeTitle/mainPrizeDescription (ce ne
  // sont que des chaines de texte), mais hasMainPrize reste false et
  // validateGamePrizes ne les regarde jamais dans ce cas -- un lot
  // instantane seul doit suffire, sans exiger ces 2 champs.
  assert.equal(game.hasMainPrize, false);
  const error = validateGamePrizes({
    hasMainPrize: false,
    mainPrizeDescription: game.mainPrizeTitle || game.mainPrizeDescription,
    secondaryPrizes: [{ name: "Bon d'achat", count: "5" }],
  });
  assert.equal(error, null);
});

test("le repli est une normalisation de lecture pure : la source Firestore n'est jamais modifiee", () => {
  const source = {
    name: "Une paire de bas",
    description: "",
    hasMainPrize: true,
    prize_value: 25,
  };
  const snapshot = fakeSnapshot("no_mutation_check", source);
  mapGameDocument(snapshot, "games", merchants);

  // mapGameDocument ne doit avoir ni ajoute main_prize_title/
  // main_prize_description a l'objet source, ni appele quoi que ce soit
  // en ecriture -- c'est un mapping Firestore -> Game en memoire, rien de
  // plus.
  assert.equal("main_prize_title" in source, false);
  assert.equal("main_prize_description" in source, false);
  assert.deepEqual(snapshot.data(), source);
});

test("les mappings de app/admin/games/page.tsx et de gamesQueriesFixed.ts " +
  "contiennent le meme repli", () => {
  // mapGameDocument de page.tsx n'est pas exportable depuis un composant
  // "use client" dans un test Node simple -- verifie structurellement,
  // meme convention que game-relaunch-current-flow.test.ts.
  const pageSource = readFileSync("app/admin/games/page.tsx", "utf8");
  assert.match(
    pageSource,
    /mainPrizeTitle: readText\(game\.main_prize_title, game\.title, game\.name\)/,
  );
  assert.match(
    pageSource,
    /mainPrizeDescription: readText\(\s*game\.main_prize_description,\s*game\.description,\s*game\.conditions,?\s*\)/,
  );

  const fixedSource = readFileSync("lib/firebase/gamesQueriesFixed.ts", "utf8");
  assert.match(fixedSource, /readString\(source\.main_prize_title\) \|\|\s*\n\s*readString\(source\.title\) \|\|\s*\n\s*readString\(source\.name\)/);
  assert.match(fixedSource, /readString\(source\.main_prize_description\) \|\|\s*\n\s*readString\(source\.description\) \|\|\s*\n\s*readString\(source\.conditions\)/);
});
