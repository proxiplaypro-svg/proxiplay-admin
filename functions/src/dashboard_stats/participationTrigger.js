/* eslint-disable @typescript-eslint/no-require-imports */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { isEligibleRegisteredPlayer } = require("./gameContract");
const { applyParticipationEvent, playerHashFromUid, sourceIdFromPath, userIdFromParticipant } = require("./participationAggregator");

function createParticipationStatisticsTrigger({ db, logger, hmacSecret }) {
  return onDocumentWritten({ document: "games/{gameId}/participants/{participantId}", secrets: [hmacSecret], retry: true, region: "europe-west1" }, async (event) => {
    const after = event.data?.after;
    const before = event.data?.before;
    const snapshot = after?.exists ? after : before;
    if (!snapshot) return;
    try {
      const participant = after?.exists ? after.data() : null;
      const uid = userIdFromParticipant(participant ?? before.data());
      // A current user read is required for exact eligibility; no user fields
      // are retained in analytics documents.
      const user = uid ? await db.doc(`users/${uid}`).get() : null;
      const sourceVersion = snapshot.updateTime?.toMillis?.();
      await applyParticipationEvent({
        db,
        sourceId: sourceIdFromPath(snapshot.ref.path),
        sourceVersion,
        participant,
        playerHash: uid ? playerHashFromUid(uid, hmacSecret.value()) : null,
        isEligiblePlayer: user?.exists ? isEligibleRegisteredPlayer(user.data()) : false,
      });
    } catch (error) {
      logger.error("Dashboard participation aggregation failed", { gameId: event.params.gameId, participantId: event.params.participantId, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });
}

module.exports = { createParticipationStatisticsTrigger };
