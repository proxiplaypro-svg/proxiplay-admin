const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { logger } = require("firebase-functions");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const {
  defineInt,
  defineSecret,
  defineString,
} = require("firebase-functions/params");
const {
  createAdminStatsRebuildExports,
} = require("./src/admin_stats/rebuild");
const {
  createAdminStatsTriggers,
} = require("./src/admin_stats/triggers");
const { resyncMerchantStats } = require("./src/merchant_stats");

setGlobalOptions({
  region: "europe-west1",
  maxInstances: 10,
});

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const { FieldValue } = admin.firestore;

const OVH_SMTP_HOST = defineString("OVH_SMTP_HOST");
const OVH_SMTP_PORT = defineInt("OVH_SMTP_PORT", { default: 587 });
const OVH_SMTP_USER = defineString("OVH_SMTP_USER");
const OVH_SMTP_PASS = defineSecret("OVH_SMTP_PASS");
const OVH_SMTP_FROM = defineString("OVH_SMTP_FROM", { default: "" });
const OVH_SMTP_FROM_NAME = defineString("OVH_SMTP_FROM_NAME", { default: "" });

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "proxiplay.pro@gmail.com")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

async function updateMerchantStats(merchantRef, updates) {
  if (!merchantRef?.path) {
    throw new Error("Merchant reference is missing.");
  }

  await merchantRef.set(updates, { merge: true });
}

async function getMerchantRefFromGameRef(gameRef) {
  const gameSnapshot = await gameRef.get();

  if (!gameSnapshot.exists) {
    throw new Error(`Game not found for ref ${gameRef.path}.`);
  }

  const enseigneRef = gameSnapshot.get("enseigne_id");

  if (!enseigneRef?.path) {
    throw new Error(`Missing enseigne_id on game ${gameSnapshot.id}.`);
  }

  return enseigneRef;
}

function getMailerTransport() {
  const host = OVH_SMTP_HOST.value();
  const port = OVH_SMTP_PORT.value();
  const user = OVH_SMTP_USER.value();
  const pass = OVH_SMTP_PASS.value();
  const fromEmail = OVH_SMTP_FROM.value();
  const fromName = OVH_SMTP_FROM_NAME.value();
  const from = fromEmail || user;

  const configPresence = {
    source: "firebase-functions/params",
    runtimeAccess: "OVH_SMTP_* via params.value()",
    legacyConfigIgnored: "functions.config().smtp",
    hasHost: Boolean(host),
    hasPort: Number.isFinite(port),
    hasUser: Boolean(user),
    hasPass: Boolean(pass),
    hasFromEmail: Boolean(fromEmail),
    hasFromName: Boolean(fromName),
  };

  logger.info("SMTP configuration presence check", configPresence);

  const missingFields = [];

  if (!host) {
    missingFields.push("OVH_SMTP_HOST");
  }

  if (!user) {
    missingFields.push("OVH_SMTP_USER");
  }

  if (!pass) {
    missingFields.push("OVH_SMTP_PASS");
  }

  if (!from) {
    missingFields.push("OVH_SMTP_FROM or OVH_SMTP_USER");
  }

  if (missingFields.length > 0) {
    logger.error("SMTP configuration incomplete", {
      ...configPresence,
      missingFields,
    });

    throw new HttpsError(
      "failed-precondition",
      `SMTP OVH configuration incomplete. Missing: ${missingFields.join(", ")}. This function reads Firebase Functions v2 params OVH_SMTP_* at runtime, not functions.config().smtp.`,
      {
        source: "firebase-functions/params",
        runtimeAccess: "OVH_SMTP_* via params.value()",
        legacyConfigIgnored: "functions.config().smtp",
        missingFields,
        hasHost: configPresence.hasHost,
        hasPort: configPresence.hasPort,
        hasUser: configPresence.hasUser,
        hasPass: configPresence.hasPass,
        hasFromEmail: configPresence.hasFromEmail,
        hasFromName: configPresence.hasFromName,
      },
    );
  }

  return {
    transport: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    }),
    from: fromName ? `${fromName} <${from}>` : from,
  };
}

function assertAuthenticatedAdmin(request) {
  const auth = request.auth;
  const email = auth?.token?.email?.toLowerCase();

  if (!auth?.uid || !email) {
    throw new HttpsError(
      "unauthenticated",
      "Authentication is required to send merchant emails.",
    );
  }

  if (!ADMIN_EMAILS.includes(email)) {
    throw new HttpsError(
      "permission-denied",
      "Only admins can send merchant emails.",
    );
  }

  return email;
}

function readTrimmedString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpsError(
      "invalid-argument",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return value.trim();
}

function getSafeSmtpErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("535") || normalized.includes("authentication failed")) {
    return "SMTP authentication failed. Check OVH_SMTP_USER and OVH_SMTP_PASS.";
  }

  if (normalized.includes("econnrefused")) {
    return "SMTP connection refused. Check OVH_SMTP_HOST and OVH_SMTP_PORT.";
  }

  if (normalized.includes("etimedout") || normalized.includes("timeout")) {
    return "SMTP connection timed out. Check host, port, and outbound network access.";
  }

  if (normalized.includes("certificate") || normalized.includes("tls")) {
    return "SMTP TLS error. Check the OVH host, port, and security mode.";
  }

  return "Unable to send merchant email.";
}

function readOptionalString(...values) {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();

      if (trimmed) {
        return trimmed;
      }
    }
  }

  return "";
}

function buildUserLabel(userId, userData = {}) {
  const pseudo = readOptionalString(userData.pseudo, userData.display_name, userData.displayName);
  const fullName = readOptionalString(
    [userData.first_name, userData.last_name].filter(Boolean).join(" "),
    [userData.firstName, userData.lastName].filter(Boolean).join(" "),
  );

  return fullName || pseudo || userId;
}

function normalizeReferralGameStatus(status) {
  return ["draft", "active", "ended"].includes(status) ? status : "draft";
}

async function rebuildReferralGameTicketCount(gameRef) {
  const entriesSnapshot = await gameRef.collection("entries").get();

  await gameRef.set(
    {
      ticket_count: entriesSnapshot.size,
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return entriesSnapshot.size;
}

async function reconcileReferralGameTicketsInternal(gameId) {
  const gameRef = db.collection("referral_games").doc(gameId);
  const gameSnapshot = await gameRef.get();

  if (!gameSnapshot.exists) {
    throw new HttpsError("not-found", "Jeu de parrainage introuvable.");
  }

  const game = gameSnapshot.data() || {};
  const status = normalizeReferralGameStatus(game.status);
  const startDate = game.start_date;
  const endDate = game.end_date;

  if (!startDate?.toMillis || !endDate?.toMillis) {
    throw new HttpsError("failed-precondition", "Les dates du jeu de parrainage sont invalides.");
  }

  const referralsSnapshot = await db.collection("referrals").get();
  const existingEntriesSnapshot = await gameRef.collection("entries").get();
  const existingEntryIds = new Set(existingEntriesSnapshot.docs.map((doc) => doc.id));
  const acceptedCutoff = status === "ended" ? endDate.toMillis() : Date.now();

  let created = 0;
  let alreadyExists = 0;
  let ineligible = 0;
  let batch = db.batch();
  let batchOps = 0;

  for (const referralDoc of referralsSnapshot.docs) {
    const referral = referralDoc.data() || {};
    const inviterUid = readOptionalString(referral.inviterUid);
    const inviteeUid = readOptionalString(referral.inviteeUid);
    const acceptedAt = referral.acceptedAt;
    const isAccepted = referral.status === "accepted" && inviterUid && inviteeUid && acceptedAt?.toMillis;

    if (!isAccepted) {
      ineligible += 1;
      continue;
    }

    const acceptedAtMs = acceptedAt.toMillis();
    const isWithinWindow =
      acceptedAtMs >= startDate.toMillis() &&
      acceptedAtMs <= endDate.toMillis() &&
      acceptedAtMs <= acceptedCutoff;

    if (!isWithinWindow) {
      ineligible += 1;
      continue;
    }

    if (existingEntryIds.has(referralDoc.id)) {
      alreadyExists += 1;
      continue;
    }

    const entryRef = gameRef.collection("entries").doc(referralDoc.id);
    batch.set(entryRef, {
      referral_id: referralDoc.id,
      inviter_uid: inviterUid,
      invitee_uid: inviteeUid,
      accepted_at: acceptedAt,
      eligibility_status: "eligible",
      created_at: FieldValue.serverTimestamp(),
      source: "referral_reconcile",
    });
    existingEntryIds.add(referralDoc.id);
    created += 1;
    batchOps += 1;

    if (batchOps >= 450) {
      await batch.commit();
      batch = db.batch();
      batchOps = 0;
    }
  }

  if (batchOps > 0) {
    await batch.commit();
  }

  await rebuildReferralGameTicketCount(gameRef);

  return {
    created,
    already_exists: alreadyExists,
    ineligible,
  };
}

function selectWeightedWinner(entries) {
  if (!entries.length) {
    return null;
  }

  const winnerIndex = Math.floor(Math.random() * entries.length);
  return entries[winnerIndex] ?? null;
}

async function drawReferralGameWinnerInternal(gameId, options = {}) {
  const { allowRepair = false, trigger = "manual" } = options;
  const gameRef = db.collection("referral_games").doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameSnapshot = await transaction.get(gameRef);

    if (!gameSnapshot.exists) {
      throw new HttpsError("not-found", "Jeu de parrainage introuvable.");
    }

    const game = gameSnapshot.data() || {};
    const currentStatus = normalizeReferralGameStatus(game.status);

    if (game.winner_uid && !allowRepair) {
      return { status: "already_drawn" };
    }

    const entriesSnapshot = await transaction.get(gameRef.collection("entries"));
    const eligibleEntries = entriesSnapshot.docs.filter((entryDoc) => {
      const inviterUid = readOptionalString(entryDoc.get("inviter_uid"));
      const eligibilityStatus = readOptionalString(entryDoc.get("eligibility_status"));
      return Boolean(inviterUid) && eligibilityStatus !== "ineligible";
    });

    if (eligibleEntries.length === 0) {
      transaction.set(gameRef, {
        status: "ended",
        draw_status: "no_eligible_entries",
        drawn_at: FieldValue.serverTimestamp(),
        ticket_count: 0,
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });

      return { status: "no_eligible_entries" };
    }

    const existingWinnerUid = readOptionalString(game.winner_uid);
    const winnerEntry = existingWinnerUid
      ? eligibleEntries.find(
          (entryDoc) => readOptionalString(entryDoc.get("inviter_uid")) === existingWinnerUid,
        ) ?? null
      : selectWeightedWinner(eligibleEntries);

    if (!winnerEntry && !existingWinnerUid) {
      throw new HttpsError("internal", "Impossible de determiner un gagnant.");
    }

    const winnerUid = existingWinnerUid || readOptionalString(winnerEntry?.get("inviter_uid"));
    const winnerEntries = eligibleEntries.filter(
      (entryDoc) => readOptionalString(entryDoc.get("inviter_uid")) === winnerUid,
    );
    const winnerTicketCount = winnerEntries.length;
    const totalTicketCount = eligibleEntries.length;
    const winnerUserRef = db.collection("users").doc(winnerUid);
    const winnerUserSnapshot = await transaction.get(winnerUserRef);
    const winnerUser = winnerUserSnapshot.data() || {};
    const winnerLabel = buildUserLabel(winnerUid, winnerUser);
    const winnerEmail = readOptionalString(winnerUser.email);
    const hasExistingPrizeRef = Boolean(game.prize_ref?.path);
    const prizeRef = hasExistingPrizeRef ? game.prize_ref : db.collection("prizes").doc();

    if (!hasExistingPrizeRef) {
      transaction.set(prizeRef, {
        referral_game_id: gameId,
        winner_id: winnerUserRef,
        win_date: FieldValue.serverTimestamp(),
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
        status: "attribue",
        prize_label: readOptionalString(game.prize_description) || "Lot parrainage",
        prize_type: "referral_game",
        prize_value: Number.isFinite(Number(game.prize_value)) ? Number(game.prize_value) : 0,
        winner_label: winnerLabel,
        winner_email: winnerEmail,
      });
    }

    transaction.set(gameRef, {
      status: "ended",
      draw_status: "drawn",
      winner_uid: winnerUid,
      winner_ref: winnerUserRef,
      winner_label: winnerLabel,
      winner_email: winnerEmail,
      winner_ticket_count: winnerTicketCount,
      total_ticket_count: totalTicketCount,
      prize_ref: prizeRef,
      ticket_count: totalTicketCount,
      drawn_at: FieldValue.serverTimestamp(),
      drawn_via: trigger,
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });

    logger.info("Referral game winner selected", {
      gameId,
      trigger,
      previousStatus: currentStatus,
      winnerUid,
      winnerTicketCount,
      totalTicketCount,
      allowRepair,
    });

    return {
      status: "drawn",
      winner_uid: winnerUid,
      winner_ticket_count: winnerTicketCount,
      total_ticket_count: totalTicketCount,
    };
  });
}

exports.sendMerchantEmail = onCall(
  {
    secrets: [OVH_SMTP_PASS],
  },
  async (request) => {
    const adminEmail = assertAuthenticatedAdmin(request);

    const email = readTrimmedString(request.data?.email, "email");
    const subject = readTrimmedString(request.data?.subject, "subject");
    const message = readTrimmedString(request.data?.message, "message");

    const { transport, from } = getMailerTransport();

    try {
      const info = await transport.sendMail({
        from,
        to: email,
        subject,
        text: message,
      });

      logger.info("Merchant email sent", {
        by: adminEmail,
        to: email,
        messageId: info.messageId,
      });

      return {
        success: true,
        error: null,
        messageId: info.messageId,
      };
    } catch (error) {
      const safeMessage = getSafeSmtpErrorMessage(error);

      logger.error("Failed to send merchant email", {
        by: adminEmail,
        to: email,
        error: error instanceof Error ? error.message : String(error),
        safeMessage,
      });

      throw new HttpsError(
        "internal",
        safeMessage,
      );
    }
  },
);

exports.resyncMerchantCounters = onCall(async (request) => {
  assertAuthenticatedAdmin(request);

  const merchantId = readTrimmedString(request.data?.merchantId, "merchantId");
  const merchantRef = db.collection("enseignes").doc(merchantId);
  const merchantSnapshot = await merchantRef.get();

  if (!merchantSnapshot.exists) {
    throw new HttpsError(
      "not-found",
      "Le commercant technique demande est introuvable.",
    );
  }

  try {
    const stats = await resyncMerchantStats(merchantRef);

    logger.info("Merchant counters resynchronized", {
      merchantId,
      gamesCount: stats.games_count,
      participationsCount: stats.participations_count,
      winnersCount: stats.winners_count,
      hasLastActivity: Boolean(stats.last_activity_at),
    });

    return {
      success: true,
      merchantId,
      stats: {
        gamesCount: stats.games_count,
        participationsCount: stats.participations_count,
        winnersCount: stats.winners_count,
        lastActivityAt: stats.last_activity_at?.toDate?.().toISOString?.() ?? null,
      },
    };
  } catch (error) {
    logger.error("Failed to resynchronize merchant counters", {
      merchantId,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new HttpsError(
      "internal",
      "Le backend n a pas pu resynchroniser les compteurs commercant.",
    );
  }
});

exports.adminReconcileReferralGameTickets = onCall(async (request) => {
  assertAuthenticatedAdmin(request);

  const gameId = readTrimmedString(request.data?.gameId, "gameId");

  try {
    return await reconcileReferralGameTicketsInternal(gameId);
  } catch (error) {
    logger.error("Failed to reconcile referral game tickets", {
      gameId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      "Le backend n a pas pu recalculer les tickets de parrainage.",
    );
  }
});

exports.adminDrawReferralGameWinner = onCall(async (request) => {
  assertAuthenticatedAdmin(request);

  const gameId = readTrimmedString(request.data?.gameId, "gameId");

  try {
    await reconcileReferralGameTicketsInternal(gameId);
    return await drawReferralGameWinnerInternal(gameId, { trigger: "manual" });
  } catch (error) {
    logger.error("Failed to draw referral game winner", {
      gameId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      "Le backend n a pas pu tirer le gagnant du jeu de parrainage.",
    );
  }
});

exports.adminRepairReferralGameDraw = onCall(async (request) => {
  assertAuthenticatedAdmin(request);

  const gameId = readTrimmedString(request.data?.gameId, "gameId");

  try {
    return await drawReferralGameWinnerInternal(gameId, {
      allowRepair: true,
      trigger: "repair",
    });
  } catch (error) {
    logger.error("Failed to repair referral game draw", {
      gameId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      "Le backend n a pas pu reparer le tirage du jeu de parrainage.",
    );
  }
});

exports.endExpiredReferralGames = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "Europe/Paris",
  },
  async () => {
    const now = Date.now();
    const activeGamesSnapshot = await db
      .collection("referral_games")
      .where("status", "==", "active")
      .get();

    for (const gameDoc of activeGamesSnapshot.docs) {
      const endDateMs = gameDoc.get("end_date")?.toMillis?.() ?? null;

      if (!endDateMs || endDateMs > now) {
        continue;
      }

      try {
        await reconcileReferralGameTicketsInternal(gameDoc.id);
        await drawReferralGameWinnerInternal(gameDoc.id, {
          trigger: "schedule",
        });
      } catch (error) {
        logger.error("Failed to auto-end referral game", {
          gameId: gameDoc.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },
);

exports.onGameCreated = onDocumentCreated("games/{gameId}", async (event) => {
  const snapshot = event.data;

  if (!snapshot) {
    logger.warn("onGameCreated triggered without snapshot.");
    return;
  }

  try {
    const enseigneRef = snapshot.get("enseigne_id");

    if (!enseigneRef?.path) {
      throw new Error(`Missing enseigne_id on game ${snapshot.id}.`);
    }

    await updateMerchantStats(enseigneRef, {
      games_count: FieldValue.increment(1),
    });

    logger.info("Merchant games_count incremented", {
      gameId: snapshot.id,
      enseignePath: enseigneRef.path,
    });
  } catch (error) {
    logger.error("Failed to update games_count on merchant", {
      gameId: snapshot.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

exports.onParticipantCreated = onDocumentCreated(
  "games/{gameId}/participants/{participantId}",
  async (event) => {
    const snapshot = event.data;
    const gameId = event.params.gameId;

    if (!snapshot) {
      logger.warn("onParticipantCreated triggered without snapshot.");
      return;
    }

    try {
      const gameRef = db.doc(`games/${gameId}`);
      const enseigneRef = await getMerchantRefFromGameRef(gameRef);

      await updateMerchantStats(enseigneRef, {
        participations_count: FieldValue.increment(1),
        last_activity_at: FieldValue.serverTimestamp(),
      });

      logger.info("Merchant participations_count incremented", {
        participantId: snapshot.id,
        gameId,
        enseignePath: enseigneRef.path,
      });
    } catch (error) {
      logger.error("Failed to update participations_count on merchant", {
        participantId: snapshot.id,
        gameId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

exports.onPrizeCreated = onDocumentCreated("prizes/{prizeId}", async (event) => {
  const snapshot = event.data;

  if (!snapshot) {
    logger.warn("onPrizeCreated triggered without snapshot.");
    return;
  }

  try {
    const gameRef = snapshot.get("game_id");

    if (!gameRef?.path && snapshot.get("referral_game_id")) {
      logger.info("Prize linked to referral game, merchant winner counter skipped", {
        prizeId: snapshot.id,
        referralGameId: snapshot.get("referral_game_id"),
      });
      return;
    }

    if (!gameRef?.path) {
      throw new Error(`Missing game_id on prize ${snapshot.id}.`);
    }

    const enseigneRef = await getMerchantRefFromGameRef(gameRef);

    await updateMerchantStats(enseigneRef, {
      winners_count: FieldValue.increment(1),
    });

    logger.info("Merchant winners_count incremented", {
      prizeId: snapshot.id,
      enseignePath: enseigneRef.path,
    });
  } catch (error) {
    logger.error("Failed to update winners_count on merchant", {
      prizeId: snapshot.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

exports.onInstantWinnerCreated = onDocumentCreated(
  "games/{gameId}/instant_winners/{winnerId}",
  async (event) => {
    const snapshot = event.data;
    const gameId = event.params.gameId;

    if (!snapshot) {
      logger.warn("onInstantWinnerCreated triggered without snapshot.");
      return;
    }

    try {
      const gameRef = db.doc(`games/${gameId}`);
      const enseigneRef = await getMerchantRefFromGameRef(gameRef);

      await updateMerchantStats(enseigneRef, {
        winners_count: FieldValue.increment(1),
      });

      logger.info("Merchant winners_count incremented from instant winner", {
        winnerId: snapshot.id,
        gameId,
        enseignePath: enseigneRef.path,
      });
    } catch (error) {
      logger.error("Failed to update winners_count on merchant from instant winner", {
        winnerId: snapshot.id,
        gameId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

const {
  rebuildAdminStatsCallable,
  rebuildAdminStatsScheduled,
} = createAdminStatsRebuildExports(ADMIN_EMAILS);

const {
  onAdminStatsGameCreated,
  onAdminStatsGameDeleted,
  onAdminStatsUserCreated,
  onAdminStatsUserDeleted,
  onAdminStatsEnseigneCreated,
  onAdminStatsEnseigneDeleted,
  onAdminStatsParticipantCreated,
  onAdminStatsPrizeCreated,
  onAdminStatsInstantWinnerCreated,
} = createAdminStatsTriggers();

exports.rebuildAdminStatsCallable = rebuildAdminStatsCallable;
exports.rebuildAdminStatsScheduled = rebuildAdminStatsScheduled;
exports.onAdminStatsGameCreated = onAdminStatsGameCreated;
exports.onAdminStatsGameDeleted = onAdminStatsGameDeleted;
exports.onAdminStatsUserCreated = onAdminStatsUserCreated;
exports.onAdminStatsUserDeleted = onAdminStatsUserDeleted;
exports.onAdminStatsEnseigneCreated = onAdminStatsEnseigneCreated;
exports.onAdminStatsEnseigneDeleted = onAdminStatsEnseigneDeleted;
exports.onAdminStatsParticipantCreated = onAdminStatsParticipantCreated;
exports.onAdminStatsPrizeCreated = onAdminStatsPrizeCreated;
exports.onAdminStatsInstantWinnerCreated = onAdminStatsInstantWinnerCreated;
