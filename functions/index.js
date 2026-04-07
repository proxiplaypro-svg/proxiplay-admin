const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { logger } = require("firebase-functions");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
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
