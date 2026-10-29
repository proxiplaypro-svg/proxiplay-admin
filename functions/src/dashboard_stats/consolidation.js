/* eslint-disable @typescript-eslint/no-require-imports */
const { parisDayKey } = require("./gameContract");
const { isEligibleRegisteredPlayer, isParticipationInRolling30Days, merchantIdentity, gameInProgress } = require("./gameContract");
const { collectNewAccounts } = require("./authAccounts");

function dailyReference(now = Date.now()) {
  const today = parisDayKey(now); const day = new Date(`${today}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1); const reference_date = day.toISOString().slice(0, 10);
  const start = new Date(`${reference_date}T12:00:00Z`); start.setUTCDate(start.getUTCDate() - 29);
  return { reference_date, start_date: start.toISOString().slice(0, 10) };
}

async function readPaginated(query, maximum, pageSize = 500) {
  const docs = []; let cursor = null;
  while (docs.length < maximum) {
    let page = query.limit(Math.min(pageSize, maximum - docs.length));
    if (cursor) page = page.startAfter(cursor);
    const snapshot = await page.get(); docs.push(...snapshot.docs);
    if (snapshot.size < pageSize) return { docs, complete: true };
    cursor = snapshot.docs.at(-1);
  }
  return { docs, complete: false };
}

// Deliberately simple, bounded server consolidation for current ProxiPlay volume.
// Participations get their own budget: about 22,000 over 30 days on 29/10/2026.
// Beyond a budget the source is reported incomplete (null), never partially counted.
async function consolidateFromFirestore({ db, auth, now = Date.now(), maximum = 10000, participantsMaximum = 60000, pageSize = 500, authMaximumUsers = 10000 }) {
  const reference = dailyReference(now);
  let newAccounts;
  try { newAccounts = auth ? await collectNewAccounts({ auth, referenceDate: reference.reference_date, maximumUsers: authMaximumUsers }) : { complete: false, counts: null, reason: "auth_unavailable" }; }
  catch (error) { newAccounts = { complete: false, counts: null, reason: error instanceof Error ? error.message : "auth_error" }; }
  const cutoff = new Date(`${reference.start_date}T00:00:00Z`);
  const [users, participants, games] = await Promise.all([
    readPaginated(db.collection("users").orderBy("__name__"), maximum, pageSize),
    readPaginated(db.collectionGroup("participants").where("participation_date", ">=", cutoff).orderBy("participation_date"), participantsMaximum, pageSize),
    readPaginated(db.collection("games").orderBy("__name__"), maximum, pageSize),
  ]);
  const userById = new Map(users.docs.map((item) => [item.id, item.data()]));
  const participationData = participants.docs.map((item) => item.data()).filter((item) => {
    const raw = item.user_id; const id = typeof raw === "string" ? raw : raw?.id;
    return id && isEligibleRegisteredPlayer(userById.get(id)) && parisDayKey(item.participation_date) >= reference.start_date && parisDayKey(item.participation_date) <= reference.reference_date;
  });
  const gameInputs = await Promise.all(games.docs.map(async (item) => {
    const game = item.data();
    const qr = game.access_mode === "qr_only" ? await db.doc(`game_qr_access/${item.id}`).get() : null;
    const proof = qr?.exists ? qr.data() : null;
    const expiry = proof?.expires_at?.toMillis?.() ?? null;
    const qrAccessState = game.access_mode !== "qr_only" ? undefined : (
      proof && expiry !== null && expiry > now && typeof proof.token === "string" && /^[a-f0-9]{64}$/.test(proof.token)
        ? "ready" : (proof ? "regeneration-required" : "missing")
    );
    return { data: game, qrAccessState };
  }));
  const referenceEnd = new Date(`${reference.reference_date}T23:59:59.999Z`).getTime();
  const metrics = calculateSixIndicators({ users: users.docs.map((item) => item.data()), participations: participationData, activities: participationData.map((item) => ({ player_hash: typeof item.user_id === "string" ? item.user_id : item.user_id?.id, last_played_at_ms: item.participation_date.toMillis() })), games: gameInputs, now: referenceEnd });
  metrics.participations_today = participationData.filter((item) => parisDayKey(item.participation_date) === reference.reference_date).length;
  metrics.participations_j30 = participationData.length;
  metrics.active_players_j30 = new Set(participationData.map((item) => typeof item.user_id === "string" ? item.user_id : item.user_id?.id).filter(Boolean)).size;
  const playersYesterday = new Set(participationData.filter((item) => parisDayKey(item.participation_date) === reference.reference_date).map((item) => typeof item.user_id === "string" ? item.user_id : item.user_id?.id).filter(Boolean)).size;
  const payload = { registered_players: users.complete ? metrics.registered_players : null, active_players_j30: users.complete && participants.complete ? metrics.active_players_j30 : null, participations_today: participants.complete ? metrics.participations_today : null, participations_j30: participants.complete ? metrics.participations_j30 : null, active_games: games.complete ? metrics.active_games : null, merchants_with_active_game: games.complete ? metrics.merchants_with_active_game : null };
  if (participants.complete) {
    const unique = new Set(participationData.filter((item) => parisDayKey(item.participation_date) === reference.reference_date).map((item) => typeof item.user_id === "string" ? item.user_id : item.user_id?.id).filter(Boolean));
    await db.doc(`analytics_daily/${reference.reference_date}`).set({ participations_count: metrics.participations_today, unique_players_count: unique.size, updated_at: new Date(now), source: "daily_consolidation" }, { merge: true });
  }
  if (newAccounts.complete) {
    await Promise.all(Object.entries(newAccounts.counts).map(([day, count]) => db.doc(`analytics_daily/${day}`).set({ new_accounts_count: count, new_accounts_updated_at: new Date(now), new_accounts_source: "auth_daily_consolidation" }, { merge: true })));
  }
  const definitive = {
    registered_players: payload.registered_players,
    players_yesterday: participants.complete ? playersYesterday : null,
    participations_yesterday: payload.participations_today,
    // This stays unavailable until the explicit historical initializer has
    // produced a verified cumulative baseline.
    participations_since_launch: null,
    merchants_with_active_game: payload.merchants_with_active_game,
    active_games: payload.active_games,
    new_accounts_yesterday: newAccounts.complete ? newAccounts.counts[reference.reference_date] : null,
    new_accounts_complete: newAccounts.complete,
  };
  const complete = users.complete && participants.complete && games.complete;
  await db.doc("dashboard_stats/current").set({ schema_version: 2, computed_at: new Date(now), reference_date: reference.reference_date, source_complete: complete, ...definitive }, { merge: true });
  return { metrics: payload, complete, newAccounts, reads: users.docs.length + participants.docs.length + games.docs.length + gameInputs.filter((item) => item.data.access_mode === "qr_only").length };
}

function readCount(data, field) { return typeof data?.[field] === "number" && data[field] >= 0 ? data[field] : null; }

// Reads at most the requested daily aggregate documents. It deliberately does
// not substitute zeros when an aggregate is absent or malformed.
async function consolidateTemporalMetrics({ db, now = Date.now(), days = 30 }) {
  const keys = Array.from({ length: days }, (_, index) => parisDayKey(now - index * 86_400_000));
  const snapshots = await db.getAll(...keys.map((key) => db.doc(`analytics_daily/${key}`)));
  const entries = snapshots.map((snapshot, index) => ({ key: keys[index], data: snapshot.exists ? snapshot.data() : null }));
  const today = entries[0]?.data;
  const complete = entries.every((entry) => entry.data && readCount(entry.data, "participations_count") !== null && readCount(entry.data, "unique_players_count") !== null);
  const metrics = {
    participations_today: readCount(today, "participations_count"),
    participations_j30: complete ? entries.reduce((sum, entry) => sum + entry.data.participations_count, 0) : null,
    // Daily uniques cannot be summed for a rolling unique-player metric.
    active_players_j30: null,
  };
  await db.doc("dashboard_stats/current").set({ schema_version: 1, computed_at: new Date(now), temporal_complete: complete, ...metrics }, { merge: true });
  return { metrics, complete, keys };
}

function calculateSixIndicators({ users = [], activities = [], participations = [], games = [], now = Date.now() }) {
  const active = activities.filter((item) => item?.needs_reconciliation !== true && isParticipationInRolling30Days(item?.last_played_at_ms, now));
  const playable = games.map((game) => ({ game, result: gameInProgress(game.data ?? game, { now, qrAccessState: game.qrAccessState }) })).filter((item) => item.result.state === "playable");
  return {
    registered_players: users.filter(isEligibleRegisteredPlayer).length,
    active_players_j30: new Set(active.map((item) => item.player_hash).filter(Boolean)).size,
    participations_today: participations.filter((item) => parisDayKey(item.participation_date) === parisDayKey(now)).length,
    participations_j30: participations.filter((item) => isParticipationInRolling30Days(item, now)).length,
    active_games: playable.length,
    merchants_with_active_game: new Set(playable.map((item) => merchantIdentity(item.game.data ?? item.game)).filter(Boolean)).size,
  };
}

module.exports = { consolidateTemporalMetrics, calculateSixIndicators, consolidateFromFirestore, dailyReference };
