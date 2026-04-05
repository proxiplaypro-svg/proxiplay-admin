const ADMIN_STATS_COLLECTION = "admin_stats";
const ADMIN_STATS_DOCUMENT = "global";

const ADMIN_STATS_FIELDS = {
  gamesCount: "games_count",
  activeGamesCount: "active_games_count",
  usersCount: "users_count",
  playersCount: "players_count",
  merchantsCount: "merchants_count",
  participationsCount: "participations_count",
  winnersCount: "winners_count",
  lastComputationAt: "last_computation_at",
  updatedBy: "updated_by",
};

module.exports = {
  ADMIN_STATS_COLLECTION,
  ADMIN_STATS_DOCUMENT,
  ADMIN_STATS_FIELDS,
};
