const MAX_REBUILD_AGE_MS = 7 * 60 * 60 * 1000;

function toMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value.toMillis === "function") return value.toMillis();
  return null;
}

function count(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function sourceError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Validates the already rebuilt admin counter before it is made public.
 * This performs no aggregation query: admin_stats/global is the only source.
 */
function buildPublicGamesPlayedMetric({ source, previousPublicMetric, now = Date.now() }) {
  const nowMs = toMillis(now);
  const gamesPlayed = count(source?.participations_count);
  const rebuiltCount = count(source?.last_rebuild_participations_count);
  const rebuildAtMs = toMillis(source?.last_rebuild_at);

  if (nowMs === null || gamesPlayed === null || rebuiltCount === null || rebuildAtMs === null) {
    throw sourceError("Public games-played source is incomplete.", "incomplete_source");
  }
  if (rebuildAtMs > nowMs || nowMs - rebuildAtMs > MAX_REBUILD_AGE_MS) {
    throw sourceError("The complete admin rebuild is stale.", "stale_rebuild");
  }
  if (gamesPlayed < rebuiltCount) {
    throw sourceError("The participation counter is lower than its last rebuilt value.", "inconsistent_source");
  }

  const previous = count(previousPublicMetric?.gamesPlayed);
  if (previous !== null && gamesPlayed < previous) {
    throw sourceError("The participation total decreased; publication is suspended.", "decreasing_total");
  }

  return {
    gamesPlayed,
    validatedAt: new Date(nowMs),
    sourceFreshAt: new Date(rebuildAtMs),
    source: "admin_stats/global.participations_count",
    schemaVersion: 1,
  };
}

module.exports = { MAX_REBUILD_AGE_MS, buildPublicGamesPlayedMetric, toMillis };
