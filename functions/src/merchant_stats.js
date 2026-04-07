const admin = require("firebase-admin");

const PRIZES_IN_QUERY_LIMIT = 30;

function getDb() {
  return admin.firestore();
}

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function computeMerchantStats(enseigneRef) {
  const gamesSnapshot = await getDb()
    .collection("games")
    .where("enseigne_id", "==", enseigneRef)
    .get();

  if (gamesSnapshot.empty) {
    return {
      games_count: 0,
      participations_count: 0,
      winners_count: 0,
      last_activity_at: null,
    };
  }

  let participationsCount = 0;
  let lastActivityAt = null;
  const gameRefs = [];

  for (const gameDoc of gamesSnapshot.docs) {
    gameRefs.push(gameDoc.ref);

    const participantsSnapshot = await gameDoc.ref.collection("participants").get();
    participationsCount += participantsSnapshot.size;

    participantsSnapshot.forEach((participantDoc) => {
      const activityTime =
        participantDoc.get("participation_date") || participantDoc.get("created_time");

      if (!activityTime?.toMillis) {
        return;
      }

      if (!lastActivityAt || activityTime.toMillis() > lastActivityAt.toMillis()) {
        lastActivityAt = activityTime;
      }
    });
  }

  let winnersCount = 0;
  const gameRefChunks = chunkArray(gameRefs, PRIZES_IN_QUERY_LIMIT);

  for (const refsChunk of gameRefChunks) {
    const prizesSnapshot = await getDb()
      .collection("prizes")
      .where("game_id", "in", refsChunk)
      .get();

    winnersCount += prizesSnapshot.size;
  }

  for (const gameDoc of gamesSnapshot.docs) {
    const instantWinnersSnapshot = await gameDoc.ref.collection("instant_winners").get();
    winnersCount += instantWinnersSnapshot.size;
  }

  return {
    games_count: gamesSnapshot.size,
    participations_count: participationsCount,
    winners_count: winnersCount,
    last_activity_at: lastActivityAt,
  };
}

async function writeMerchantStats(enseigneRef, stats) {
  const { FieldValue } = admin.firestore;

  await enseigneRef.set(
    {
      games_count: stats.games_count,
      participations_count: stats.participations_count,
      winners_count: stats.winners_count,
      last_activity_at: stats.last_activity_at || FieldValue.delete(),
    },
    { merge: true },
  );
}

async function resyncMerchantStats(enseigneRef) {
  const stats = await computeMerchantStats(enseigneRef);
  await writeMerchantStats(enseigneRef, stats);
  return stats;
}

module.exports = {
  computeMerchantStats,
  resyncMerchantStats,
  writeMerchantStats,
};
