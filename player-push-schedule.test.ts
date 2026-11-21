import assert from "node:assert/strict";
import test from "node:test";
import { formatParisScheduledTime, parseParisScheduledTime } from "./lib/firebase/playerPushSchedule";

test("Paris winter and summer wall times become Unix milliseconds", () => {
  assert.equal(parseParisScheduledTime("2026-01-15T10:30", Date.UTC(2026, 0, 15, 8, 0)),
    Date.UTC(2026, 0, 15, 9, 30));
  assert.equal(parseParisScheduledTime("2026-07-15T10:30", Date.UTC(2026, 6, 15, 7, 0)),
    Date.UTC(2026, 6, 15, 8, 30));
  assert.match(formatParisScheduledTime(Date.UTC(2026, 6, 15, 8, 30)), /10:30/);
});

test("past dates and anything under two minutes are rejected", () => {
  const scheduled = Date.UTC(2026, 6, 15, 8, 30);
  assert.equal(parseParisScheduledTime("2026-07-15T10:30", scheduled - 120_000), scheduled);
  assert.throws(() => parseParisScheduledTime("2026-07-15T10:30", scheduled - 119_999), /2 minutes/);
  assert.throws(() => parseParisScheduledTime("2026-07-15T10:30", scheduled + 1), /2 minutes/);
});

test("invalid and DST transition hours cannot silently shift", () => {
  const before = Date.UTC(2026, 0, 1);
  assert.throws(() => parseParisScheduledTime("2026-02-30T10:00", before), /invalide/);
  assert.throws(() => parseParisScheduledTime("2026-03-29T02:30", before), /n’existe pas/);
  assert.throws(() => parseParisScheduledTime("2026-10-25T02:30", before), /ambiguë/);
  assert.throws(() => parseParisScheduledTime("", before), /valides/);
});
