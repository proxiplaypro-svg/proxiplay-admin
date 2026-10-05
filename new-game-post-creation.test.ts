import test from "node:test";
import assert from "node:assert/strict";
import {
  createGameThenPreparePostCreation,
  getNewGamePostCreationRoute,
  shouldOfferInstantWinnerGeneration,
} from "./lib/admin/newGamePostCreation";
import { getQrGenerationActionLabel, isQrOnlyGame } from "./lib/admin/secureGameQr";

test("un jeu sans lot secondaire revient directement a la liste du commercant", () => {
  assert.equal(getNewGamePostCreationRoute("merchant 42"), "/admin/games?merchantId=merchant%2042");
  assert.equal(shouldOfferInstantWinnerGeneration(0), false);
});

test("un jeu avec lots secondaires propose leur generation apres creation", () => {
  assert.equal(shouldOfferInstantWinnerGeneration(1), true);
  assert.equal(shouldOfferInstantWinnerGeneration(8), true);
});

test("creation QR sans lot secondaire : le jeu est cree, le QR est emis, puis la liste est ciblee", async () => {
  const calls: string[] = [];
  const result = await createGameThenPreparePostCreation({
    accessMode: "qr_only",
    createGame: async () => { calls.push("create"); return { id: "qr-1", merchantId: "shop-1" }; },
    issueGameQr: async (gameId) => { calls.push(`qr:${gameId}`); },
  });

  assert.deepEqual(calls, ["create", "qr:qr-1"]);
  assert.equal(result.qrIssueFailed, false);
  assert.equal(shouldOfferInstantWinnerGeneration(0), false);
  assert.equal(getNewGamePostCreationRoute(result.game.merchantId), "/admin/games?merchantId=shop-1");
});

test("creation QR avec lots secondaires : le QR est emis avant l etape de generation", async () => {
  const calls: string[] = [];
  const result = await createGameThenPreparePostCreation({
    accessMode: "qr_only",
    createGame: async () => { calls.push("create"); return { id: "qr-2", merchantId: "shop-2" }; },
    issueGameQr: async (gameId) => { calls.push(`qr:${gameId}`); },
  });

  assert.deepEqual(calls, ["create", "qr:qr-2"]);
  assert.equal(result.qrIssueFailed, false);
  assert.equal(shouldOfferInstantWinnerGeneration(1), true);
});

test("echec QR : le jeu est conserve et le retry n entraine pas une seconde creation", async () => {
  let createCount = 0;
  let issueCount = 0;
  const createGame = async () => ({ id: `qr-${++createCount}`, merchantId: "shop-3" });
  const issueGameQr = async (gameId: string) => {
    void gameId;
    issueCount += 1;
    if (issueCount === 1) throw new Error("indisponible");
  };

  const first = await createGameThenPreparePostCreation({ accessMode: "qr_only", createGame, issueGameQr });
  assert.equal(first.qrIssueFailed, true);
  await issueGameQr(first.game.id);
  assert.equal(createCount, 1);
  assert.equal(issueCount, 2);
});

test("creation non QR : aucune emission QR automatique", async () => {
  let issued = false;
  const result = await createGameThenPreparePostCreation({
    accessMode: "public",
    createGame: async () => ({ id: "public-1", merchantId: "shop-4" }),
    issueGameQr: async () => { issued = true; },
  });

  assert.equal(result.qrIssueFailed, false);
  assert.equal(issued, false);
});

test("le bloc QR de modification est reserve aux jeux qr_only et expose l action d emission", () => {
  assert.equal(isQrOnlyGame("qr_only"), true);
  assert.equal(isQrOnlyGame("public"), false);
  assert.equal(getQrGenerationActionLabel("missing"), "Générer le QR code");
  assert.equal(getQrGenerationActionLabel("regeneration-required"), "Régénérer le QR code");
});
