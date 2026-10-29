import test from "node:test";
import assert from "node:assert/strict";
import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { mapGameDocument } from "./lib/firebase/gamesQueries";
import { resolveMainPrizeFields, validateGamePrizes } from "./lib/firebase/gamePrizeValidation";

// Historical mobile-created games may lack both dedicated prize fields.
// Relaunching them must still use the legacy name/description; explicit
// dedicated fields, including empty or null values, take precedence.

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

test("les autres parcours utilisent la meme resolution des champs", () => {
  const pageSource = readFileSync("app/admin/games/page.tsx", "utf8");
  assert.match(pageSource, /\.\.\.resolveMainPrizeFields\(game\)/);

  const fixedSource = readFileSync("lib/firebase/gamesQueriesFixed.ts", "utf8");
  assert.match(fixedSource, /main_prize_title: resolveMainPrizeFields\(source\)\.mainPrizeTitle/);
  assert.match(fixedSource, /main_prize_description: resolveMainPrizeFields\(source\)\.mainPrizeDescription/);
});

test("les champs dédiés vides ou nuls retombent sur les informations générales", () => {
  for (const fields of [
    { main_prize_title: "", main_prize_description: "Un lot" },
    { main_prize_title: "Un lot", main_prize_description: "" },
    { main_prize_title: null, main_prize_description: null },
    { main_prize_title: "Lot seul" },
  ] as Array<{ main_prize_title?: string | null; main_prize_description?: string | null }>) {
    const original = mapGameDocument(fakeSnapshot("modern", {
      name: "Jeu", description: "Description générale", hasMainPrize: true,
      prize_value: 25, ...fields,
    }), "games", merchants);
    assert.equal(original.mainPrizeTitle, fields.main_prize_title?.trim() || "Jeu");
    assert.equal(original.mainPrizeDescription, fields.main_prize_description?.trim() || "Description générale");
  }
});

test("Crepe Touch : duplication et reouverture d'un brouillon aux champs dedies vides", () => {
  const source = {
    title: "un menu Midi semaine",
    description: "Un menu midi semaine chez Crepe Touch Dunkerque",
    hasMainPrize: true,
    prize_value: 15.95,
    main_prize_title: "   ",
    main_prize_description: "",
    secondary_prizes: [{ name: "une crepe sucree offerte", count: 10 }],
    hasWinner: true,
    sessionCount: 42,
  };

  // Same reader used when the duplicate is returned and when an old draft is
  // opened again from the games list.
  const reopenedDraft = mapGameDocument(fakeSnapshot("crepe-touch-draft", source), "games", merchants);
  assert.equal(reopenedDraft.mainPrizeTitle, "un menu Midi semaine");
  assert.equal(reopenedDraft.mainPrizeDescription, "Un menu midi semaine chez Crepe Touch Dunkerque");
  assert.equal(reopenedDraft.mainPrizeValue, "15.95");
  assert.equal(reopenedDraft.secondaryPrizes.length, 1);

  const validationError = validateGamePrizes({
    hasMainPrize: reopenedDraft.hasMainPrize,
    mainPrizeDescription: reopenedDraft.mainPrizeTitle || reopenedDraft.mainPrizeDescription,
    secondaryPrizes: reopenedDraft.secondaryPrizes,
  });
  assert.equal(validationError, null, "le brouillon recupere doit etre enregistrable");

  // Reading the old draft must not mutate its source, winners or counters.
  assert.equal(source.main_prize_title, "   ");
  assert.equal(source.main_prize_description, "");
  assert.equal(source.hasWinner, true);
  assert.equal(source.sessionCount, 42);

  const fixedSource = readFileSync("lib/firebase/gamesQueriesFixed.ts", "utf8");
  assert.match(fixedSource, /main_prize_title: resolveMainPrizeFields\(source\)\.mainPrizeTitle/);
  assert.match(fixedSource, /main_prize_description: resolveMainPrizeFields\(source\)\.mainPrizeDescription/);
  assert.match(fixedSource, /main_prize_title: input\.mainPrizeTitle\.trim\(\)/);
  assert.match(fixedSource, /main_prize_description: input\.mainPrizeDescription\.trim\(\)/);
});

test("un tirage final sans texte de lot ni informations generales reste refuse", () => {
  const fields = resolveMainPrizeFields({
    main_prize_title: " ",
    main_prize_description: " ",
  });
  assert.equal(fields.mainPrizeTitle, "");
  assert.equal(fields.mainPrizeDescription, "");
  assert.equal(validateGamePrizes({
    hasMainPrize: true,
    mainPrizeDescription: fields.mainPrizeTitle || fields.mainPrizeDescription,
    secondaryPrizes: [{ name: "une crepe sucree offerte", count: 10 }],
  }), "Le lot principal est obligatoire lorsque le tirage final est active.");
});
