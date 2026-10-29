// Pure mapping of the consolidated dashboard documents, shared by the admin API
// route (server) and its tests. No Firestore import: the inputs are plain data.

export type ReliableDashboardMetricKey =
  | "registeredPlayers"
  | "playersYesterday"
  | "participationsYesterday"
  | "merchantsWithActiveGame"
  | "activeGames";

export type ReliableDashboardSnapshot = {
  ready: boolean;
  referenceDate: string | null;
  metrics: Record<ReliableDashboardMetricKey, number | null>;
  daily: Array<{ day: string; participations: number | null; uniquePlayers: number | null }>;
};

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

/**
 * `current` is dashboard_stats/current, `days` the analytics_daily documents
 * (id = Paris day "YYYY-MM-DD"), any order. Only a complete schema 2
 * consolidation is "ready": anything else is shown as unavailable, never as 0.
 */
export function mapReliableDashboard(
  current: Record<string, unknown> | null,
  days: Array<{ id: string; data: Record<string, unknown> }>,
): ReliableDashboardSnapshot {
  const ready = current?.schema_version === 2 && current.source_complete === true;
  return {
    ready,
    referenceDate: typeof current?.reference_date === "string" ? current.reference_date : null,
    metrics: {
      registeredPlayers: count(current?.registered_players),
      playersYesterday: count(current?.players_yesterday),
      participationsYesterday: count(current?.participations_yesterday),
      merchantsWithActiveGame: count(current?.merchants_with_active_game),
      activeGames: count(current?.active_games),
    },
    daily: days
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.id))
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(-30)
      .map((item) => ({
        day: item.id,
        participations: count(item.data.participations_count),
        uniquePlayers: count(item.data.unique_players_count),
      })),
  };
}
