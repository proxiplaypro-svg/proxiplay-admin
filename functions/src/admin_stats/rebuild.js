const admin = require("firebase-admin");
const { logger } = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const {
  assertAuthenticatedAdmin,
  isActiveGameData,
  logAdminStatsError,
  writeAdminStatsRebuild,
} = require("./helpers");

async function rebuildAdminStats() {
  logger.info("Starting admin_stats/global rebuild");
  const db = admin.firestore();

  const [
    gamesSnapshot,
    usersCountSnapshot,
    playersCountSnapshot,
    merchantsCountSnapshot,
    participationsCountSnapshot,
    winnersCountSnapshot,
  ] = await Promise.all([
    db.collection("games").get(),
    db.collection("users").count().get(),
    db.collection("users").where("user_role", "==", "joueur").count().get(),
    db.collection("enseignes").count().get(),
    db.collectionGroup("participants").count().get(),
    db.collection("prizes").count().get(),
  ]);

  const now = new Date();
  const activeGamesCount = gamesSnapshot.docs.filter((doc) =>
    isActiveGameData(doc.data(), now),
  ).length;

  const stats = {
    gamesCount: gamesSnapshot.size,
    activeGamesCount,
    usersCount: usersCountSnapshot.data().count,
    playersCount: playersCountSnapshot.data().count,
    merchantsCount: merchantsCountSnapshot.data().count,
    participationsCount: participationsCountSnapshot.data().count,
    winnersCount: winnersCountSnapshot.data().count,
  };

  await writeAdminStatsRebuild(stats);

  logger.info("Completed admin_stats/global rebuild", stats);

  return stats;
}

function createAdminStatsRebuildExports(adminEmails) {
  const rebuildAdminStatsCallable = onCall(async (request) => {
    try {
      const adminEmail = assertAuthenticatedAdmin(request, adminEmails);
      const stats = await rebuildAdminStats();

      return {
        success: true,
        error: null,
        source: "rebuild",
        requestedBy: adminEmail,
        timestamp: new Date().toISOString(),
        stats,
      };
    } catch (error) {
      logAdminStatsError("Failed to rebuild admin stats via callable", {}, error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "Unable to rebuild admin stats.",
      );
    }
  });

  const rebuildAdminStatsScheduled = onSchedule(
    {
      schedule: "every 6 hours",
      timeZone: "Europe/Paris",
    },
    async () => {
      // TODO: resserrer ou specialiser cette planification si la fraicheur du compteur
      // active_games_count doit suivre plus finement les transitions temporelles.
      await rebuildAdminStats();
    },
  );

  return {
    rebuildAdminStatsCallable,
    rebuildAdminStatsScheduled,
  };
}

module.exports = {
  createAdminStatsRebuildExports,
  rebuildAdminStats,
};
