/* eslint-disable @typescript-eslint/no-require-imports */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
function createQrStatisticsTrigger({ db }) {
  return onDocumentWritten({ document: "game_qr_access/{gameId}", region: "europe-west1", retry: true }, async (event) => {
    const data = event.data?.after?.exists ? event.data.after.data() : null;
    const ready = !!data && data.expires_at?.toMillis?.() > Date.now() && typeof data.token === "string";
    await db.doc(`analytics_game_access/${event.params.gameId}`).set({ qr_access_state: ready ? "ready" : "unavailable", updated_at: new Date() }, { merge: true });
  });
}
module.exports = { createQrStatisticsTrigger };
