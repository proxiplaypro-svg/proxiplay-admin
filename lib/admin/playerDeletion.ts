// Suppression d'un compte joueur par l'Admin : passe par la Cloud Function
// callable adminDeletePlayerAccount (depot canonique, us-central1), jamais par
// une suppression directe de users/{uid} (refusee par les regles Firestore
// et qui laissait le compte Firebase Auth actif).
//
// Parametres attendus par la fonction (admin_player_deletion.js) :
//   userId       : identifiant du compte (sans « / », 128 caracteres max)
//   reason       : motif, 5 a 200 caracteres apres normalisation des espaces
//   confirmation : exactement « SUPPRIMER »

export const PLAYER_DELETION_CONFIRMATION_WORD = "SUPPRIMER";
export const PLAYER_DELETION_REASON_MIN = 5;
export const PLAYER_DELETION_REASON_MAX = 200;

export type PlayerDeletionPayload = {
  userId: string;
  reason: string;
  confirmation: string;
};

export type PlayerDeletionResult = {
  deletionId: string;
  authDeleted: boolean;
  profileDeleted: boolean;
  consentEventsRetained?: number;
};

export function normalizeDeletionReason(reason: string): string {
  return reason.trim().replace(/\s+/g, " ");
}

/** Meme controle que la fonction serveur, pour un message immediat. */
export function buildPlayerDeletionPayload(input: {
  userId: string;
  reason: string;
  confirmation: string;
}): { ok: true; payload: PlayerDeletionPayload } | { ok: false; error: string } {
  const userId = input.userId.trim();
  if (!userId || userId.includes("/") || userId.length > 128) {
    return { ok: false, error: "Joueur invalide." };
  }
  const reason = normalizeDeletionReason(input.reason);
  if (reason.length < PLAYER_DELETION_REASON_MIN || reason.length > PLAYER_DELETION_REASON_MAX) {
    return {
      ok: false,
      error: `Le motif est obligatoire (${PLAYER_DELETION_REASON_MIN} à ${PLAYER_DELETION_REASON_MAX} caractères).`,
    };
  }
  if (input.confirmation.trim() !== PLAYER_DELETION_CONFIRMATION_WORD) {
    return { ok: false, error: `Saisissez ${PLAYER_DELETION_CONFIRMATION_WORD} pour confirmer.` };
  }
  return { ok: true, payload: { userId, reason, confirmation: PLAYER_DELETION_CONFIRMATION_WORD } };
}

/** Message affiche a l'admin : celui de la fonction serveur quand elle en donne un. */
export function playerDeletionErrorMessage(error: unknown): string {
  const code = typeof (error as { code?: unknown })?.code === "string" ?
    String((error as { code: string }).code).replace(/^functions\//, "") : "";
  const message = typeof (error as { message?: unknown })?.message === "string" ?
    String((error as { message: string }).message).trim() : "";
  if (code === "unauthenticated") return "Session expirée : reconnectez-vous.";
  if (code === "permission-denied") return "Suppression réservée à l'administration.";
  if (code === "not-found" && !message) return "Compte introuvable.";
  if (["invalid-argument", "failed-precondition", "not-found", "internal"].includes(code) && message &&
      message.toLowerCase() !== code && message.toLowerCase() !== "internal") {
    return message;
  }
  return "Impossible de supprimer ce joueur. Réessayez dans un instant.";
}
