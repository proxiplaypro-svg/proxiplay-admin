const admin = require("firebase-admin");
const { logger } = require("firebase-functions");
const { HttpsError } = require("firebase-functions/v2/https");
const {
  ADMIN_STATS_COLLECTION,
  ADMIN_STATS_DOCUMENT,
  ADMIN_STATS_FIELDS,
} = require("./constants");

const { FieldValue } = admin.firestore;

function getAdminStatsRef() {
  return admin.firestore().collection(ADMIN_STATS_COLLECTION).doc(ADMIN_STATS_DOCUMENT);
}

function isActiveGameData(data, now = new Date()) {
  const startDate = data?.start_date?.toDate?.();
  const endDate = data?.end_date?.toDate?.();

  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
    return false;
  }

  if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
    return false;
  }

  return (
    data.visible_public === true &&
    startDate.getTime() <= now.getTime() &&
    endDate.getTime() >= now.getTime()
  );
}

async function writeAdminStatsRebuild(stats) {
  await getAdminStatsRef().set(
    {
      [ADMIN_STATS_FIELDS.gamesCount]: stats.gamesCount,
      [ADMIN_STATS_FIELDS.activeGamesCount]: stats.activeGamesCount,
      [ADMIN_STATS_FIELDS.usersCount]: stats.usersCount,
      [ADMIN_STATS_FIELDS.playersCount]: stats.playersCount,
      [ADMIN_STATS_FIELDS.merchantsCount]: stats.merchantsCount,
      [ADMIN_STATS_FIELDS.participationsCount]: stats.participationsCount,
      [ADMIN_STATS_FIELDS.winnersCount]: stats.winnersCount,
      [ADMIN_STATS_FIELDS.lastComputationAt]: FieldValue.serverTimestamp(),
      [ADMIN_STATS_FIELDS.updatedBy]: "rebuild",
    },
    { merge: true },
  );
}

async function applyIncrementalAdminStats(updates) {
  await getAdminStatsRef().set(
    {
      ...updates,
      [ADMIN_STATS_FIELDS.lastComputationAt]: FieldValue.serverTimestamp(),
      [ADMIN_STATS_FIELDS.updatedBy]: "incremental",
    },
    { merge: true },
  );
}

function assertAuthenticatedAdmin(request, adminEmails) {
  const auth = request.auth;
  const email = auth?.token?.email?.toLowerCase();

  if (!auth?.uid || !email) {
    throw new HttpsError(
      "unauthenticated",
      "Authentication is required.",
    );
  }

  if (!adminEmails.includes(email)) {
    throw new HttpsError(
      "permission-denied",
      "Only admins can execute this action.",
    );
  }

  return email;
}

function logAdminStatsError(message, context, error) {
  logger.error(message, {
    ...context,
    error: error instanceof Error ? error.message : String(error),
  });
}

module.exports = {
  ADMIN_STATS_FIELDS,
  FieldValue,
  applyIncrementalAdminStats,
  assertAuthenticatedAdmin,
  getAdminStatsRef,
  isActiveGameData,
  logAdminStatsError,
  writeAdminStatsRebuild,
};
