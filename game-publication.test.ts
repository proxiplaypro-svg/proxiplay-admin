import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { adminGameState, gamePublicationState } from "./lib/admin/gamePublication";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const DAY = 86400000;
const running = { startMs: NOW - 10 * DAY, endMs: NOW + 10 * DAY };

// Shared with the app and Cloud Functions (sibling repository): the three
// implementations must agree on every case.
const sharedCases = "../Proxiplay-develop/test/fixtures/game_publication_cases.json";
test("matches the case table shared with the app and Cloud Functions", { skip: !existsSync(sharedCases) }, () => {
  const cases = JSON.parse(readFileSync(sharedCases, "utf8")) as Array<{ name: string; game: object; state: string }>;
  for (const c of cases) assert.equal(gamePublicationState(c.game), c.state, c.name);
});

test("a published running game is active without alert", () => {
  assert.deepEqual(adminGameState({ visible_public: true, status: "actif", ...running }, NOW),
    { status: "actif", publicationAlert: null });
  assert.deepEqual(adminGameState({ ...running }, NOW), { status: "actif", publicationAlert: null });
});

test("a real draft is a draft, no longer shown active because of its dates", () => {
  assert.equal(adminGameState({ visible_public: false, status: "brouillon", participations: 0, ...running }, NOW).status, "brouillon");
});

test("La Malle aux Croquettes: active, with an alert to regularise", () => {
  const state = adminGameState({ visible_public: false, status: "brouillon", unique_players_count: 262,
    participations: 1198, ...running }, NOW);
  assert.equal(state.status, "actif");
  assert.match(state.publicationAlert ?? "", /262 joueurs.*brouillon.*régulariser/);
});

test("a draft with a few plays stays a draft but is flagged for review", () => {
  const state = adminGameState({ visible_public: false, status: "brouillon", unique_players_count: 2,
    participations: 3, ...running }, NOW);
  assert.equal(state.status, "brouillon");
  assert.match(state.publicationAlert ?? "", /3 participation\(s\) sur un brouillon/);
});

test("ended, deactivated, hidden and private states", () => {
  assert.equal(adminGameState({ visible_public: true, startMs: NOW - 9 * DAY, endMs: NOW - DAY }, NOW).status, "expire");
  assert.equal(adminGameState({ visible_public: false, status: "desactive", unique_players_count: 300, ...running }, NOW).status, "desactive");
  assert.equal(adminGameState({ visible_public: false, visible_public_auto_published: true, ...running }, NOW).status, "desactive");
  assert.equal(adminGameState({ visible_public: true, status: "prive", ...running }, NOW).status, "prive");
  assert.equal(adminGameState({ visible_public: true, isPrivate: true, ...running }, NOW).status, "prive");
});

test("the list switch deactivates explicitly instead of returning to draft", () => {
  const page = readFileSync("app/admin/games/page.tsx", "utf8");
  assert.match(page, /game\.status === "prive" \? "desactive" : "actif"/);
  const card = readFileSync("components/admin/jeux/GameCard.tsx", "utf8");
  assert.match(card, /publicationAlert/);
  assert.doesNotMatch(card, /passer en brouillon/);
});
