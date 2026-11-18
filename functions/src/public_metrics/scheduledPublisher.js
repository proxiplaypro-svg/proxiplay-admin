const { onSchedule } = require("firebase-functions/v2/scheduler");
const { buildPublicGamesPlayedMetric } = require("./gamesPlayed");

function createPublicGamesPlayedPublisher({ db, logger }) {
  return onSchedule(
    {
      schedule: "0 4 * * 1",
      timeZone: "Europe/Paris",
      region: "europe-west1",
      timeoutSeconds: 60,
      memory: "256MiB",
    },
    async () => {
      const [sourceSnapshot, publicSnapshot] = await Promise.all([
        db.doc("admin_stats/global").get(),
        db.doc("public_metrics/games_played").get(),
      ]);

      try {
        const metric = buildPublicGamesPlayedMetric({
          source: sourceSnapshot.exists ? sourceSnapshot.data() : null,
          previousPublicMetric: publicSnapshot.exists ? publicSnapshot.data() : null,
        });
        await db.doc("public_metrics/games_played").set(metric);
        logger.info("Published validated public games-played metric", {
          gamesPlayed: metric.gamesPlayed,
          validatedAt: metric.validatedAt.toISOString(),
        });
      } catch (error) {
        // Throw before any write: the previous public metric remains intact.
        logger.error("Public games-played publication suspended", {
          code: error?.code || "unknown",
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  );
}

module.exports = { createPublicGamesPlayedPublisher };
