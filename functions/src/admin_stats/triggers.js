const admin = require("firebase-admin");
const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const {
  ADMIN_STATS_FIELDS,
  FieldValue,
  applyIncrementalAdminStats,
  isActiveGameData,
  logAdminStatsError,
} = require("./helpers");

function createAdminStatsTriggers() {
  // TODO: si le projet modifie start_date, end_date ou visible_public apres creation,
  // ajouter un trigger onDocumentUpdated sur games. Pour l'instant, la coherence
  // temporelle de active_games_count est garantie par le rebuild complet planifie.
  const onAdminStatsGameCreated = onDocumentCreated("games/{gameId}", async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      return;
    }

    try {
      const gameData = snapshot.data();
      const updates = {
        [ADMIN_STATS_FIELDS.gamesCount]: FieldValue.increment(1),
      };

      if (isActiveGameData(gameData)) {
        updates[ADMIN_STATS_FIELDS.activeGamesCount] = FieldValue.increment(1);
      }

      await applyIncrementalAdminStats(updates);
    } catch (error) {
      logAdminStatsError("Failed to increment admin stats on game create", {
        gameId: snapshot.id,
      }, error);
    }
  });

  const onAdminStatsGameDeleted = onDocumentDeleted("games/{gameId}", async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      return;
    }

    try {
      const gameData = snapshot.data();
      const updates = {
        [ADMIN_STATS_FIELDS.gamesCount]: FieldValue.increment(-1),
      };

      if (isActiveGameData(gameData)) {
        updates[ADMIN_STATS_FIELDS.activeGamesCount] = FieldValue.increment(-1);
      }

      await applyIncrementalAdminStats(updates);
    } catch (error) {
      logAdminStatsError("Failed to decrement admin stats on game delete", {
        gameId: snapshot.id,
      }, error);
    }
  });

  const onAdminStatsUserCreated = onDocumentCreated("users/{userId}", async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      return;
    }

    try {
      const userData = snapshot.data();
      const updates = {
        [ADMIN_STATS_FIELDS.usersCount]: FieldValue.increment(1),
      };

      if (userData.user_role === "joueur") {
        updates[ADMIN_STATS_FIELDS.playersCount] = FieldValue.increment(1);
      }

      await applyIncrementalAdminStats(updates);
    } catch (error) {
      logAdminStatsError("Failed to increment admin stats on user create", {
        userId: snapshot.id,
      }, error);
    }
  });

  const onAdminStatsUserDeleted = onDocumentDeleted("users/{userId}", async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      return;
    }

    try {
      const userData = snapshot.data();
      const updates = {
        [ADMIN_STATS_FIELDS.usersCount]: FieldValue.increment(-1),
      };

      if (userData.user_role === "joueur") {
        updates[ADMIN_STATS_FIELDS.playersCount] = FieldValue.increment(-1);
      }

      await applyIncrementalAdminStats(updates);
    } catch (error) {
      logAdminStatsError("Failed to decrement admin stats on user delete", {
        userId: snapshot.id,
      }, error);
    }
  });

  const onAdminStatsEnseigneCreated = onDocumentCreated(
    "enseignes/{merchantId}",
    async (event) => {
      const snapshot = event.data;

      if (!snapshot) {
        return;
      }

      try {
        await applyIncrementalAdminStats({
          [ADMIN_STATS_FIELDS.merchantsCount]: FieldValue.increment(1),
        });
      } catch (error) {
        logAdminStatsError("Failed to increment admin stats on enseigne create", {
          merchantId: snapshot.id,
        }, error);
      }
    },
  );

  const onAdminStatsEnseigneDeleted = onDocumentDeleted(
    "enseignes/{merchantId}",
    async (event) => {
      const snapshot = event.data;

      if (!snapshot) {
        return;
      }

      try {
        await applyIncrementalAdminStats({
          [ADMIN_STATS_FIELDS.merchantsCount]: FieldValue.increment(-1),
        });
      } catch (error) {
        logAdminStatsError("Failed to decrement admin stats on enseigne delete", {
          merchantId: snapshot.id,
        }, error);
      }
    },
  );

  const onAdminStatsParticipantCreated = onDocumentCreated(
    "games/{gameId}/participants/{participantId}",
    async (event) => {
      const snapshot = event.data;

      if (!snapshot) {
        return;
      }

      try {
        await applyIncrementalAdminStats({
          [ADMIN_STATS_FIELDS.participationsCount]: FieldValue.increment(1),
        });
      } catch (error) {
        logAdminStatsError("Failed to increment admin stats on participant create", {
          gameId: event.params.gameId,
          participantId: snapshot.id,
        }, error);
      }
    },
  );

  const onAdminStatsPrizeCreated = onDocumentCreated("prizes/{prizeId}", async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      return;
    }

    try {
      await applyIncrementalAdminStats({
        [ADMIN_STATS_FIELDS.winnersCount]: FieldValue.increment(1),
      });
    } catch (error) {
      logAdminStatsError("Failed to increment admin stats on prize create", {
        prizeId: snapshot.id,
      }, error);
    }
  });

  const onAdminStatsInstantWinnerCreated = onDocumentCreated(
    "games/{gameId}/instant_winners/{winnerId}",
    async (event) => {
      const snapshot = event.data;

      if (!snapshot) {
        return;
      }

      try {
        await applyIncrementalAdminStats({
          [ADMIN_STATS_FIELDS.winnersCount]: FieldValue.increment(1),
        });
      } catch (error) {
        logAdminStatsError("Failed to increment admin stats on instant winner create", {
          gameId: event.params.gameId,
          winnerId: snapshot.id,
        }, error);
      }
    },
  );

  return {
    onAdminStatsGameCreated,
    onAdminStatsGameDeleted,
    onAdminStatsUserCreated,
    onAdminStatsUserDeleted,
    onAdminStatsEnseigneCreated,
    onAdminStatsEnseigneDeleted,
    onAdminStatsParticipantCreated,
    onAdminStatsPrizeCreated,
    onAdminStatsInstantWinnerCreated,
  };
}

module.exports = {
  createAdminStatsTriggers,
};
