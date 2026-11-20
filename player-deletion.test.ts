import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildPlayerDeletionPayload,
  playerDeletionErrorMessage,
  PLAYER_DELETION_CONFIRMATION_WORD,
} from "./lib/admin/playerDeletion";

test("payload : parametres exacts de adminDeletePlayerAccount (userId, reason, confirmation)", () => {
  const result = buildPlayerDeletionPayload({ userId: " u1 ", reason: "  Demande   RGPD du joueur ", confirmation: "SUPPRIMER" });
  assert.deepEqual(result, { ok: true, payload: { userId: "u1", reason: "Demande RGPD du joueur", confirmation: "SUPPRIMER" } });
  assert.equal(PLAYER_DELETION_CONFIRMATION_WORD, "SUPPRIMER");
});

test("motif obligatoire (5 a 200 caracteres) et confirmation explicite", () => {
  assert.equal(buildPlayerDeletionPayload({ userId: "u1", reason: "   ", confirmation: "SUPPRIMER" }).ok, false);
  assert.equal(buildPlayerDeletionPayload({ userId: "u1", reason: "abcd", confirmation: "SUPPRIMER" }).ok, false);
  assert.equal(buildPlayerDeletionPayload({ userId: "u1", reason: "x".repeat(201), confirmation: "SUPPRIMER" }).ok, false);
  assert.equal(buildPlayerDeletionPayload({ userId: "u1", reason: "Doublon de compte", confirmation: "supprimer" }).ok, false);
  assert.equal(buildPlayerDeletionPayload({ userId: "u1", reason: "Doublon de compte", confirmation: "" }).ok, false);
  assert.equal(buildPlayerDeletionPayload({ userId: "a/b", reason: "Doublon de compte", confirmation: "SUPPRIMER" }).ok, false);
});

test("erreurs : message de la fonction serveur affiche tel quel quand il existe", () => {
  assert.equal(playerDeletionErrorMessage({ code: "functions/failed-precondition",
    message: "Compte commercant : utiliser la suppression dediee aux commercants." }),
  "Compte commercant : utiliser la suppression dediee aux commercants.");
  assert.equal(playerDeletionErrorMessage({ code: "functions/invalid-argument", message: "Le motif est obligatoire (5 a 200 caracteres)." }),
    "Le motif est obligatoire (5 a 200 caracteres).");
  assert.equal(playerDeletionErrorMessage({ code: "functions/permission-denied", message: "Reserve a l'administration." }),
    "Suppression réservée à l'administration.");
  assert.equal(playerDeletionErrorMessage({ code: "functions/internal", message: "internal" }),
    "Impossible de supprimer ce joueur. Réessayez dans un instant.");
  assert.equal(playerDeletionErrorMessage(new Error("network")), "Impossible de supprimer ce joueur. Réessayez dans un instant.");
});

test("page joueur : plus aucune suppression directe de users, appel de la fonction serveur", () => {
  const page = readFileSync("app/admin/joueurs/[userId]/page.tsx", "utf8");
  assert.doesNotMatch(page, /deleteDoc/);
  assert.match(page, /deletePlayerAccountAction\(/);
  assert.match(page, /buildPlayerDeletionPayload\(/);
  const actions = readFileSync("lib/firebase/adminActions.ts", "utf8");
  assert.match(actions, /httpsCallable<PlayerDeletionPayload, PlayerDeletionResult>\(\s*canonicalFunctionsClient,\s*"adminDeletePlayerAccount"/);
});
