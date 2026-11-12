// Pure mapping of the consolidated dashboard documents, shared by the admin API
// route (server) and its tests. No Firestore import: the inputs are plain data.

export type ReliableDashboardMetricKey =
  | "registeredPlayers"
  | "uniquePlayersYesterday"
  | "uniquePlayersLastWeek"
  | "uniquePlayersLastMonth"
  | "inactivePlayersLastMonth"
  | "participationsYesterday"
  | "participationsSinceLaunch"
  | "activeGames";

export type ReliableDashboardSnapshot = {
  ready: boolean;
  referenceDate: string | null;
  metrics: Record<ReliableDashboardMetricKey, number | null>;
  weeklyPeriod: { start: string; end: string } | null;
  monthlyPeriod: { start: string; end: string } | null;
  daily: Array<{ day: string; participations: number | null; uniquePlayers: number | null; available: boolean }>;
  referenceIsYesterday: boolean;
};

const DAILY_SOURCES = new Set(["daily_consolidation", "dashboard_daily_backfill"]);

/**
 * Ids of the analytics_daily documents ("YYYY-MM-DD", Paris day) of the `days`
 * days ending at `referenceDate`, oldest first. Reading them by id needs no
 * Firestore index. Day ids are calendar dates: computed at noon UTC so that no
 * daylight-saving change can skip or repeat a day.
 */
export function dailyDocumentIds(referenceDate: string | null, days = 30): string[] {
  if (!referenceDate || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) return [];
  const end = new Date(`${referenceDate}T12:00:00Z`);
  if (Number.isNaN(end.getTime()) || end.toISOString().slice(0, 10) !== referenceDate) return [];
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - (days - 1 - index));
    return day.toISOString().slice(0, 10);
  });
}

function parisDayKey(value: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function previousDay(day: string) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

/**
 * `current` is dashboard_stats/current, `days` the analytics_daily documents
 * (id = Paris day "YYYY-MM-DD"), any order. The screen can render partial
 * data; each unavailable metric remains explicitly unavailable rather than 0.
 */
export function mapReliableDashboard(
  current: Record<string, unknown> | null,
  days: Array<{ id: string; data: Record<string, unknown> }>,
  now = Date.now(),
): ReliableDashboardSnapshot {
  const ready = current?.source_complete === true;
  const period = (prefix: "weekly" | "monthly") => {
    const start = current?.[`${prefix}_period_start`]; const end = current?.[`${prefix}_period_end`];
    return typeof start === "string" && typeof end === "string" ? { start, end } : null;
  };
  const referenceDate = typeof current?.reference_date === "string" ? current.reference_date : null;
  const dailyById = new Map(days.map((item) => [item.id, item.data]));
  const daily = dailyDocumentIds(referenceDate, 90).map((day) => {
    const data = dailyById.get(day);
    const participations = count(data?.participations_count);
    const uniquePlayers = count(data?.unique_players_count);
    // A zero is valid only in a recognised consolidation, never inferred from
    // a missing document or an unknown producer.
    const available = DAILY_SOURCES.has(typeof data?.source === "string" ? data.source : "") && participations !== null && uniquePlayers !== null;
    return { day, participations: available ? participations : null, uniquePlayers: available ? uniquePlayers : null, available };
  });
  const yesterday = referenceDate ? daily.find((item) => item.day === referenceDate) : null;
  const today = parisDayKey(now);
  return {
    ready,
    referenceDate,
    referenceIsYesterday: referenceDate === previousDay(today),
    metrics: {
      registeredPlayers: count(current?.registered_players),
      uniquePlayersYesterday: yesterday?.available ? yesterday.uniquePlayers : null,
      uniquePlayersLastWeek: current?.weekly_source_complete === true ? count(current?.weekly_unique_players) : null,
      uniquePlayersLastMonth: current?.monthly_source_complete === true ? count(current?.monthly_unique_players) : null,
      inactivePlayersLastMonth: current?.monthly_source_complete === true ? count(current?.monthly_inactive_players) : null,
      participationsYesterday: count(current?.participations_yesterday),
      participationsSinceLaunch: count(current?.participations_since_launch),
      activeGames: count(current?.active_games),
    },
    weeklyPeriod: period("weekly"),
    monthlyPeriod: period("monthly"),
    daily,
  };
}

export type ChartUnit = { one: string; many: string };

/** "YYYY-MM-DD" is a Paris calendar day: formatted at noon UTC, never shifted. */
export function formatChartDay(day: string) {
  const text = new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** French thousands separator; singular for 0 and 1, as in French. */
export function formatChartValue(value: number, unit: ChartUnit) {
  return `${value.toLocaleString("fr-FR")} ${value >= 2 ? unit.many : unit.one}`;
}
