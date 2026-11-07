/* eslint-disable @typescript-eslint/no-require-imports */
const { parisDayKey, toMillis } = require("./gameContract");
const { isEligibleRegisteredPlayer, isParticipationInRolling30Days, merchantIdentity, gameInProgress } = require("./gameContract");

function dailyReference(now = Date.now()) {
  const today = parisDayKey(now); const day = new Date(`${today}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1); const reference_date = day.toISOString().slice(0, 10);
  const start = new Date(`${reference_date}T12:00:00Z`); start.setUTCDate(start.getUTCDate() - 29);
  return { reference_date, start_date: start.toISOString().slice(0, 10) };
}

function participationMillis(item) {
  const value = item?.participation_date;
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function addParisCalendarDays(dayKey, offset) {
  const day = new Date(`${dayKey}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}

function completedWeekReference(now = Date.now()) {
  const today = parisDayKey(now);
  if (!today) throw new Error("A valid date is required.");
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "short" }).format(new Date(now));
  const daysSinceMonday = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[weekday];
  if (daysSinceMonday === undefined) throw new Error("Unable to resolve Paris weekday.");
  const end_date = addParisCalendarDays(today, -daysSinceMonday);
  return { start_date: addParisCalendarDays(end_date, -7), end_date };
}

function completedMonthReference(now = Date.now()) {
  const today = parisDayKey(now);
  if (!today) throw new Error("A valid date is required.");
  const [year, month] = today.split("-").map(Number);
  const end_date = `${year}-${String(month).padStart(2, "0")}-01`;
  const previous = new Date(Date.UTC(year, month - 2, 1, 12));
  return { start_date: previous.toISOString().slice(0, 10), end_date };
}

function userRegistrationMillis(user) {
  return toMillis(user?.created_time) ?? toMillis(user?.created_at) ?? toMillis(user?.createdAt);
}

// Converts a Paris calendar day (YYYY-MM-DD) to its real UTC midnight.  A
// plain `${day}T00:00:00Z` is not equivalent on either side of CET/CEST and
// can silently omit the first one or two hours of the first J30 day.
function parisMidnightMillis(dayKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) throw new Error("A Paris day key is required.");
  const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  let candidate = target;
  // Two passes cover offset changes at the beginning/end of daylight saving
  // time while keeping this dependency-free in the Functions runtime.
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = formatter.formatToParts(new Date(candidate));
    const value = (type) => Number(parts.find((part) => part.type === type)?.value);
    candidate += target - Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  }
  return candidate;
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
async function consolidateFromFirestore({ db, now = Date.now(), maximum = 10000, participantsMaximum = 60000, pageSize = 500 }) {
  const reference = dailyReference(now);
  const cutoff = new Date(parisMidnightMillis(reference.start_date));
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
  const rollingComplete = users.complete && participants.complete;
  const payload = {
    registered_players: users.complete ? metrics.registered_players : null,
    active_players_j30: rollingComplete ? metrics.active_players_j30 : null,
    participations_today: participants.complete ? metrics.participations_today : null,
    participations_j30: participants.complete ? metrics.participations_j30 : null,
    active_games: games.complete ? metrics.active_games : null,
    merchants_with_active_game: games.complete ? metrics.merchants_with_active_game : null,
  };
  if (participants.complete) {
    const unique = new Set(participationData.filter((item) => parisDayKey(item.participation_date) === reference.reference_date).map((item) => typeof item.user_id === "string" ? item.user_id : item.user_id?.id).filter(Boolean));
    await db.doc(`analytics_daily/${reference.reference_date}`).set({ participations_count: metrics.participations_today, unique_players_count: unique.size, updated_at: new Date(now), source: "daily_consolidation" }, { merge: true });
  }
  const definitive = {
    registered_players: payload.registered_players,
    active_players_j30: payload.active_players_j30,
    participations_j30: payload.participations_j30,
    players_yesterday: participants.complete ? playersYesterday : null,
    participations_yesterday: payload.participations_today,
    // This stays unavailable until the explicit historical initializer has
    // produced a verified cumulative baseline.
    participations_since_launch: null,
    merchants_with_active_game: payload.merchants_with_active_game,
    active_games: payload.active_games,
  };
  const complete = users.complete && participants.complete && games.complete;
  await db.doc("dashboard_stats/current").set({ schema_version: 3, computed_at: new Date(now), reference_date: reference.reference_date, source_complete: complete, ...definitive }, { merge: true });
  return { metrics: payload, complete, reads: users.docs.length + participants.docs.length + games.docs.length + gameInputs.filter((item) => item.data.access_mode === "qr_only").length };
}

// The closed-period jobs write only their own fields. This keeps the daily
// consolidation authoritative for all existing dashboard indicators.
async function consolidateCompletedPeriod({ db, period, now = Date.now(), maximum = 10000, participantsMaximum = 60000, pageSize = 500 }) {
  if (period !== "week" && period !== "month") throw new Error("period must be week or month");
  const reference = period === "week" ? completedWeekReference(now) : completedMonthReference(now);
  const start = new Date(parisMidnightMillis(reference.start_date));
  const end = new Date(parisMidnightMillis(reference.end_date));
  const [users, participants] = await Promise.all([
    readPaginated(db.collection("users").orderBy("__name__"), maximum, pageSize),
    readPaginated(db.collectionGroup("participants").where("participation_date", ">=", start).where("participation_date", "<", end).orderBy("participation_date"), participantsMaximum, pageSize),
  ]);
  const userById = new Map(users.docs.map((item) => [item.id, item.data()]));
  const eligibleUsers = users.docs.map((item) => item.data()).filter(isEligibleRegisteredPlayer);
  // A historical inactive count needs a creation time for every eligible
  // account. Returning null is safer than treating an unknown account as old.
  const registrationsComplete = eligibleUsers.every((user) => userRegistrationMillis(user) !== null);
  const eligibleAtEnd = eligibleUsers.filter((user) => {
    const registeredAt = userRegistrationMillis(user);
    return registeredAt !== null && registeredAt < end.getTime();
  });
  const participantIds = new Set(participants.docs.flatMap((item) => {
    const data = item.data(); const at = participationMillis(data);
    const raw = data.user_id; const id = typeof raw === "string" ? raw : raw?.id;
    const user = userById.get(id);
    const registeredAt = userRegistrationMillis(user);
    return at !== null && at >= start.getTime() && at < end.getTime() && typeof id === "string" && id && isEligibleRegisteredPlayer(user) && registeredAt !== null && registeredAt < end.getTime() ? [id] : [];
  }));
  const complete = users.complete && participants.complete && registrationsComplete;
  const fieldPrefix = period === "week" ? "weekly" : "monthly";
  const common = {
    [`${fieldPrefix}_period_start`]: reference.start_date,
    [`${fieldPrefix}_period_end`]: reference.end_date,
    [`${fieldPrefix}_source_complete`]: complete,
    [`${fieldPrefix}_computed_at`]: new Date(now),
  };
  const fields = period === "week"
    ? { weekly_unique_players: complete ? participantIds.size : null }
    : {
      monthly_unique_players: complete ? participantIds.size : null,
      monthly_inactive_players: complete ? Math.max(0, eligibleAtEnd.length - participantIds.size) : null,
    };
  await db.doc("dashboard_stats/current").set({ ...common, ...fields }, { merge: true });
  return { period, reference, complete, reads: users.docs.length + participants.docs.length, uniquePlayers: complete ? participantIds.size : null };
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
  // This legacy helper is intentionally unable to overwrite the authoritative
  // J30 fields. Daily uniques cannot establish a rolling unique-player count;
  // consolidateFromFirestore is the single writer for both J30 values.
  await db.doc("dashboard_stats/current").set({ temporal_complete: complete, temporal_participations_today: metrics.participations_today }, { merge: true });
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

module.exports = { consolidateTemporalMetrics, calculateSixIndicators, consolidateFromFirestore, consolidateCompletedPeriod, completedWeekReference, completedMonthReference, dailyReference, parisMidnightMillis };
