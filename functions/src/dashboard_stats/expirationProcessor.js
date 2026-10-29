// Uses Firestore's automatic single-field ascending index on expiration_at_ms.
async function processExpiredContributions({ db, now = Date.now(), limit = 200 }) {
  const expired = await db.collection("analytics_expirations").where("expiration_at_ms", "<=", now).orderBy("expiration_at_ms").limit(limit).get();
  let processed = 0;
  for (const item of expired.docs) {
    const data = item.data(); const source = db.doc(`analytics_contributions/${data.source_id}`);
    await db.runTransaction(async (tx) => {
      const contribution = await tx.get(source);
      const current = contribution.exists ? contribution.data() : null;
      if (current?.active === true && current.participation_at_ms === data.participation_at_ms && current.expiration_at_ms <= now) {
        tx.set(source, { window_active: false, expired_at_ms: now }, { merge: true });
      }
      tx.delete(item.ref); // queue receipt: retry cannot apply it twice
    });
    processed += 1;
  }
  return { processed, complete: expired.size < limit };
}
module.exports = { processExpiredContributions };
