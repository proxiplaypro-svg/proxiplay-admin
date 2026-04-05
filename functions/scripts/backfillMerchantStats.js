const admin = require("firebase-admin");
const { FieldValue } = admin.firestore;
const { computeMerchantStats } = require("../src/merchant_stats");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const PAGE_SIZE = 25;

async function backfillMerchantStats() {
  console.log("Starting enseignes stats backfill...");

  const bulkWriter = db.bulkWriter();
  let lastDoc = null;
  let page = 0;
  let processed = 0;

  bulkWriter.onWriteError((error) => {
    console.error("BulkWriter error:", error.documentRef.path, error.message);
    return false;
  });

  while (true) {
    let enseignesQuery = db.collection("enseignes").orderBy("__name__").limit(PAGE_SIZE);

    if (lastDoc) {
      enseignesQuery = enseignesQuery.startAfter(lastDoc);
    }

    const enseignesSnapshot = await enseignesQuery.get();

    if (enseignesSnapshot.empty) {
      break;
    }

    page += 1;
    console.log(`Processing page ${page} with ${enseignesSnapshot.size} enseignes...`);

    for (const enseigneDoc of enseignesSnapshot.docs) {
      const stats = await computeMerchantStats(enseigneDoc.ref);

      bulkWriter.set(
        enseigneDoc.ref,
        {
          games_count: stats.games_count,
          participations_count: stats.participations_count,
          winners_count: stats.winners_count,
          last_activity_at: stats.last_activity_at || FieldValue.delete(),
        },
        { merge: true },
      );

      processed += 1;
      console.log(
        `[${processed}] ${enseigneDoc.id} -> games=${stats.games_count}, participations=${stats.participations_count}, winners=${stats.winners_count}, last_activity=${stats.last_activity_at ? "yes" : "no"}`,
      );
    }

    lastDoc = enseignesSnapshot.docs[enseignesSnapshot.docs.length - 1];
  }

  await bulkWriter.close();
  console.log(`Backfill completed. Total enseignes processed: ${processed}`);
}

backfillMerchantStats().catch((error) => {
  console.error("Backfill failed:", error);
  process.exitCode = 1;
});
