import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("la relance genere les gains instantanes avant de publier", () => {
  const page = readFileSync("app/admin/games/page.tsx", "utf8");
  const generateIndex = page.indexOf("await generateInstantWinnersForGame(selectedGame.id)");
  const publishIndex = page.indexOf("await updateGameStatus({", generateIndex);

  assert.ok(generateIndex >= 0, "la relance doit appeler le generateur d'instant_winners");
  assert.ok(publishIndex > generateIndex, "la publication doit suivre la generation des occurrences");
  assert.match(page, /if \(expectedInstantCount > 0\)/);
  assert.match(page, /calendar\.desiredCount !== expectedInstantCount/);
  assert.match(page, /existingCount \+ createdCount !== expectedInstantCount/);
});
