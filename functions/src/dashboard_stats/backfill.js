/* eslint-disable @typescript-eslint/no-require-imports */
const { applyParticipationEvent, playerHashFromUid, sourceIdFromPath, userIdFromParticipant } = require("./participationAggregator");
const { isEligibleRegisteredPlayer } = require("./gameContract");

// One bounded page only. Callers must persist the returned cursor/checkpoint.
async function backfillParticipationPage({ db, hmacSecret, cursor = null, checkpointId = "j90", limit = 200, dryRun = true, now = Date.now() }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("limit must be between 1 and 500");
  const start = new Date(now - 90 * 86_400_000);
  let query = db.collectionGroup("participants").where("participation_date", ">=", start).orderBy("participation_date").limit(limit);
  const checkpointRef = db.doc(`analytics_backfill_checkpoints/${checkpointId}`);
  const checkpoint = !dryRun && !cursor ? await checkpointRef.get() : null;
  if (!cursor && checkpoint?.exists && checkpoint.data()?.next_cursor) cursor = checkpoint.data().next_cursor;
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();
  let valid = 0; let invalid = 0;
  for (const participant of snapshot.docs) {
    const data = participant.data(); const uid = userIdFromParticipant(data);
    if (!uid || !data.participation_date?.toMillis) { invalid += 1; continue; }
    valid += 1;
    const user = await db.doc(`users/${uid}`).get();
    if (!dryRun) await applyParticipationEvent({ db, sourceId: sourceIdFromPath(participant.ref.path), sourceVersion: participant.updateTime.toMillis(), participant: data, playerHash: playerHashFromUid(uid, hmacSecret), isEligiblePlayer: user.exists && isEligibleRegisteredPlayer(user.data()) });
  }
  const nextCursor = snapshot.docs.at(-1)?.get("participation_date") ?? null;
  const complete = snapshot.size < limit;
  if (!dryRun) await checkpointRef.set({ kind: "participants_j90", next_cursor: complete ? null : nextCursor, complete, scanned: snapshot.size, valid, invalid, updated_at: new Date(), window_start: start }, { merge: true });
  return { dryRun, scanned: snapshot.size, valid, invalid, nextCursor, complete };
}

module.exports = { backfillParticipationPage };
