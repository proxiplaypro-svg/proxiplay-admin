import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { mapGameDocument } from "./lib/firebase/gamesQueries";

function fakeSnapshot(id: string, data: Record<string, unknown>) {
  return { id, data: () => data } as unknown as QueryDocumentSnapshot<DocumentData>;
}

test("un QR historique sans champ de consommation conserve le comportement historique", () => {
  const game = mapGameDocument(
    fakeSnapshot("legacy-qr", { access_mode: "qr_only" }),
    "games",
    new Map(),
  );

  assert.equal(game.accessMode, "qr_only");
  assert.equal(game.qrConsumesParticipation, true);
});

test("la lecture distingue les QR gratuits et les QR qui decompte une chance", () => {
  const freeQr = mapGameDocument(
    fakeSnapshot("free-qr", { access_mode: "qr_only", qr_consumes_participation: false }),
    "games",
    new Map(),
  );
  const paidQr = mapGameDocument(
    fakeSnapshot("paid-qr", { access_mode: "qr_only", qr_consumes_participation: true }),
    "games",
    new Map(),
  );

  assert.equal(freeQr.qrConsumesParticipation, false);
  assert.equal(paidQr.qrConsumesParticipation, true);
});

test("creation, edition et duplication restent synchronisees entre les deux modules", () => {
  const source = readFileSync("lib/firebase/gamesQueries.ts", "utf8");
  const fixed = readFileSync("lib/firebase/gamesQueriesFixed.ts", "utf8");

  for (const moduleSource of [source, fixed]) {
    assert.match(moduleSource, /input\.accessMode === "qr_only"[\s\S]{0,120}qr_consumes_participation: input\.qrConsumesParticipation/);
    assert.match(moduleSource, /input\.qrConsumesParticipation === undefined[\s\S]{0,100}qr_consumes_participation: input\.qrConsumesParticipation/);
  }

  assert.match(source, /access_mode: original\.accessMode,[\s\S]*qr_consumes_participation: original\.qrConsumesParticipation/);
  assert.match(fixed, /source\.qr_consumes_participation !== false/);
});

test("les jeux classiques ne recoivent pas le champ et les controles restent limites aux QR", () => {
  const createForm = readFileSync("app/admin/games/NewGameForm.tsx", "utf8");
  const editModal = readFileSync("components/admin/jeux/GameEditModal.tsx", "utf8");

  assert.match(createForm, /accessMode === "qr_only"/);
  assert.match(createForm, /qrConsumesParticipation: false/);
  assert.match(editModal, /game\.accessMode === "qr_only"/);
  assert.match(editModal, /game\?\.qrConsumesParticipation \?\? true/);
  assert.match(sourceCode("lib/firebase/gamesQueries.ts"), /input\.accessMode === "qr_only"/);
});

test("les regles Firestore permettent a l'admin d'enregistrer le nouveau champ", () => {
  const rules = sourceCode("firestore.rules");

  assert.match(
    rules,
    /match \/games\/\{gameId\} \{[\s\S]{0,500}allow update: if isAdmin\(\) \|\| hasAdminClaim\(\)/,
  );
});

function sourceCode(path: string) {
  return readFileSync(path, "utf8");
}
