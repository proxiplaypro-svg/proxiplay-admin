/* eslint-disable @typescript-eslint/no-require-imports */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { isEligibleRegisteredPlayer } = require("./gameContract");
const { consolidateFromFirestore } = require("./consolidation");

function createDashboardAutomations({ db, logger }) {
  const onDashboardUserWritten = onDocumentWritten("users/{userId}", async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    const delta = Number(isEligibleRegisteredPlayer(after)) - Number(isEligibleRegisteredPlayer(before));
    if (!delta) return;
    await db.runTransaction(async (tx) => {
      const ref = db.doc("dashboard_stats/player_counter"); const snap = await tx.get(ref);
      const current = typeof snap.data()?.registered_players === "number" ? snap.data().registered_players : 0;
      tx.set(ref, { registered_players: Math.max(0, current + delta), updated_at: new Date() }, { merge: true });
    });
  });
  // Date/status changes are deliberately handled by the scheduled isolated
  // consolidation; this trigger only records that a fresh pass is required.
  const onDashboardGameWritten = onDocumentWritten("games/{gameId}", async () => {
    await db.doc("dashboard_stats/control").set({ games_dirty: true, games_dirty_at: new Date() }, { merge: true });
  });
  const dashboardStatsConsolidation = onSchedule({ schedule: "0 3 * * *", timeZone: "Europe/Paris", region: "europe-west1" }, async () => {
    try {
      const result = await consolidateFromFirestore({ db });
      await db.doc("dashboard_stats/current").set({ computed_at: new Date(), temporal_complete: result.complete }, { merge: true });
    } catch (error) { logger.error("Dashboard consolidation failed", { error: error instanceof Error ? error.message : String(error) }); throw error; }
  });
  return { onDashboardUserWritten, onDashboardGameWritten, dashboardStatsConsolidation };
}
module.exports = { createDashboardAutomations };
