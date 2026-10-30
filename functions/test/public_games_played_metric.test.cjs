const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  MAX_REBUILD_AGE_MS,
  buildPublicGamesPlayedMetric,
} = require("../src/public_metrics/gamesPlayed");

const now = Date.parse("2026-11-02T03:00:00.000Z");
const source = {
  participations_count: 136630,
  last_rebuild_participations_count: 136620,
  last_rebuild_at: new Date(now - 60 * 60 * 1000),
};

test("publishes a fresh non-decreasing rebuilt total", () => {
  const metric = buildPublicGamesPlayedMetric({
    source,
    previousPublicMetric: { gamesPlayed: 136600 },
    now,
  });
  assert.equal(metric.gamesPlayed, 136630);
  assert.equal(metric.validatedAt.toISOString(), "2026-11-02T03:00:00.000Z");
  assert.equal(metric.sourceFreshAt.toISOString(), "2026-11-02T02:00:00.000Z");
});

test("rejects a source without a recent complete rebuild", () => {
  assert.throws(
    () => buildPublicGamesPlayedMetric({
      source: { ...source, last_rebuild_at: new Date(now - MAX_REBUILD_AGE_MS - 1) },
      now,
    }),
    (error) => error.code === "stale_rebuild",
  );
});

test("rejects an unexpected public total decrease without writing", () => {
  assert.throws(
    () => buildPublicGamesPlayedMetric({
      source,
      previousPublicMetric: { gamesPlayed: 136631 },
      now,
    }),
    (error) => error.code === "decreasing_total",
  );
});

test("rejects a counter lower than its last complete rebuild", () => {
  assert.throws(
    () => buildPublicGamesPlayedMetric({
      source: { ...source, participations_count: 136619 },
      now,
    }),
    (error) => error.code === "inconsistent_source",
  );
});

test("weekly schedule uses Monday 04:00 Europe/Paris", () => {
  const publisher = fs.readFileSync(
    path.resolve(__dirname, "..", "src", "public_metrics", "scheduledPublisher.js"),
    "utf8",
  );
  assert.match(publisher, /schedule:\s*"0 4 \* \* 1"/);
  assert.match(publisher, /timeZone:\s*"Europe\/Paris"/);
});
