/* eslint-disable @typescript-eslint/no-require-imports */
const MAX_TITLE_LENGTH = 120;
const MAX_MERCHANT_NAME_LENGTH = 120;
const CACHE_TTL_MS = 7 * 60 * 60 * 1000;

function readText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function clamp(value, maximum) {
  return value.length > maximum ? value.slice(0, maximum).trimEnd() : value;
}

function toDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value && typeof value.toDate === "function") {
    const result = value.toDate();
    return result instanceof Date && !Number.isNaN(result.getTime()) ? result : null;
  }
  return null;
}

/**
 * Creates the single cacheable document consumed by the public site.
 * `activeGameDocs` is deliberately supplied by the complete admin rebuild:
 * this helper never queries Firestore and only whitelists public-safe fields.
 */
function buildActiveCatalog({ activeGameDocs, now = new Date() }) {
  const validatedAt = toDate(now);
  if (!validatedAt) throw new Error("A valid publication date is required.");

  const games = activeGameDocs.map((snapshot) => {
    const data = snapshot.data();
    const title = clamp(readText(data.title, data.name, "Jeu ProxiPlay"), MAX_TITLE_LENGTH);
    const merchantName = clamp(readText(data.merchantName, data.enseigne_name, "Commerce partenaire"), MAX_MERCHANT_NAME_LENGTH);
    const endsAt = toDate(data.end_date ?? data.endDate);
    if (!endsAt) throw new Error(`Active game ${snapshot.id} has no valid end date.`);
    return {
      id: snapshot.id,
      title,
      merchantName,
      endsAt,
      accessMode: data.access_mode === "qr_only" ? "qr_only" : "classic",
      restrictedToAdults: data.prohibited_for_minors === true || data.restrictedToAdults === true,
    };
  }).sort((left, right) => left.endsAt.getTime() - right.endsAt.getTime() || left.id.localeCompare(right.id));

  const merchants = new Map();
  for (const game of games) {
    const current = merchants.get(game.merchantName) ?? { name: game.merchantName, activeGamesCount: 0 };
    current.activeGamesCount += 1;
    merchants.set(game.merchantName, current);
  }

  const earliestEndAtMs = games.reduce(
    (earliest, game) => Math.min(earliest, game.endsAt.getTime()),
    Infinity,
  );
  const normalExpiryMs = validatedAt.getTime() + CACHE_TTL_MS;

  return {
    schemaVersion: 1,
    source: "admin_stats/full_rebuild",
    validatedAt,
    // The website must treat the catalog as unavailable after this deadline,
    // rather than presenting an old list as current if a later rebuild fails.
    // The aggregate counts cease to be exact as soon as any listed game ends.
    // Consumers may therefore hide the whole block at that point until the
    // next complete rebuild, rather than retain an expired game/count.
    validUntil: new Date(Math.min(normalExpiryMs, earliestEndAtMs)),
    activeGamesCount: games.length,
    activeMerchantsCount: merchants.size,
    games,
    merchants: [...merchants.values()].sort((left, right) => left.name.localeCompare(right.name, "fr")),
  };
}

module.exports = { CACHE_TTL_MS, buildActiveCatalog };
