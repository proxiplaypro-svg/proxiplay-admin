import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareGameRelaunch, INSTANT_PREPARATION_ERROR, type InstantCalendarResult } from "./lib/firebase/gameRelaunchWorkflow";

function fixture(counts = [2]) {
  const source = { id: "source", status: "expire", counts: [...counts] };
  const draft = { id: "new-game", status: "brouillon", public: false, counts: [...source.counts] };
  const slots = new Set<string>();
  const events: string[] = [];
  let fail = false;
  let invalidDates = false;
  let responsePatch: Partial<InstantCalendarResult> = {};
  const run = () => prepareGameRelaunch({
    gameId: draft.id,
    counts: draft.counts,
    saveDraft: async () => {
      events.push("save-draft");
      draft.status = "brouillon"; draft.public = false;
      return draft.id;
    },
    generate: async () => {
      events.push("generate");
      assert.equal(draft.public, false);
      const existingCount = slots.size;
      const desiredCount = draft.counts.reduce((a, b) => a + b, 0);
      // Model the existing backend's idempotent occurrence identifiers.
      for (let i = 0; i < desiredCount; i++) slots.add(draft.id + ":" + i);
      if (fail) throw new Error("Response lost after server commit");
      return {
        ok: true, gameId: draft.id, desiredCount, existingCount,
        createdCount: slots.size - existingCount, duplicateExistingKeys: [],
        unexpectedExistingCount: 0, hasAssignedInstantWinner: false,
        ...responsePatch,
      };
    },
    verifyCalendar: async () => {
      events.push("verify");
      if (invalidDates || slots.size !== draft.counts.reduce((a, b) => a + b, 0)) {
        throw new Error("Invalid calendar");
      }
    },
    publish: async () => {
      events.push("publish"); draft.status = "actif"; draft.public = true;
    },
  });
  return { source, draft, slots, events, run,
    fail: () => { fail = true; }, recover: () => { fail = false; },
    invalidDates: () => { invalidDates = true; },
    patch: (value: Partial<InstantCalendarResult>) => { responsePatch = value; },
  };
}

test("edited duplicate publishes only after saving final lots and preparing its own calendar", async () => {
  const f = fixture([1]);
  f.draft.counts = [2];
  assert.notEqual(f.source.id, f.draft.id);
  await f.run();
  assert.deepEqual(f.events, ["save-draft", "generate", "verify", "publish"]);
  assert.equal(f.slots.size, 2);
  assert.equal(f.draft.public, true);
  assert.deepEqual(f.source.counts, [1]);
  assert.equal(f.source.status, "expire");
});

test("generator failure keeps the same draft non-public and returns the visible error", async () => {
  const f = fixture(); f.fail();
  await assert.rejects(f.run(), { message: INSTANT_PREPARATION_ERROR });
  assert.equal(f.draft.public, false);
  assert.equal(f.draft.status, "brouillon");
  assert.ok(!f.events.includes("publish"));
});

test("without secondary prizes, no generator call is made", async () => {
  const f = fixture([]);
  await f.run();
  assert.ok(!f.events.includes("generate"));
  assert.equal(f.draft.public, true);
});

test("retry after a lost server response reuses the draft and the two existing occurrences", async () => {
  const f = fixture(); f.fail();
  await assert.rejects(f.run());
  assert.equal(f.slots.size, 2);
  f.recover(); await f.run();
  assert.equal(f.draft.id, "new-game");
  assert.equal(f.slots.size, 2);
  assert.equal(f.events.filter(e => e === "publish").length, 1);
});

for (const patch of [
  { ok: false }, { gameId: "source" }, { desiredCount: 1 },
  { createdCount: 0 }, { duplicateExistingKeys: ["0:0"] },
  { unexpectedExistingCount: 1 }, { hasAssignedInstantWinner: true },
]) test("backend inconsistency blocks publication: " + JSON.stringify(patch), async () => {
  const f = fixture(); f.patch(patch);
  await assert.rejects(f.run(), { message: INSTANT_PREPARATION_ERROR });
  assert.equal(f.draft.public, false);
});

test("edited dates incompatible with an existing calendar block publication", async () => {
  const f = fixture(); f.invalidDates();
  await assert.rejects(f.run(), { message: INSTANT_PREPARATION_ERROR });
  assert.equal(f.draft.public, false);
});

test("removing all lots after a failed attempt cannot publish leftover occurrences", async () => {
  const f = fixture(); f.fail(); await assert.rejects(f.run());
  f.draft.counts = []; f.recover();
  await assert.rejects(f.run(), { message: INSTANT_PREPARATION_ERROR });
  assert.equal(f.draft.public, false);
});

test("admin duplicate submit uses the guarded service and the canonical region", () => {
  const page = readFileSync("app/admin/games/page.tsx", "utf8");
  const service = readFileSync("lib/firebase/gamesQueries.ts", "utf8");
  assert.match(page, /modalMode === "duplicate" \? relaunchGame : updateGame/);
  assert.match(service, /getFunctions\(firebaseApp, "us-central1"\)/);
  assert.match(service, /"generateInstantWinnersForGame"/);
  assert.match(page, /setModalFeedback\(getGamesQueryErrorMessage\(saveError\)\)/);
});
