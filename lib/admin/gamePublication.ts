// Publication rule for games, mirrored in the app
// (lib/utils/player_game_visibility.dart) and the backend
// (firebase/functions/game_publication.js). Keep the three in sync.
//
// A game left with stale draft flags but proven launched by the
// server-maintained player counters keeps running; the Admin shows it as
// active with an alert to regularise, instead of hiding the inconsistency.

const CLOSED_STATUSES = new Set([
  "cancelled", "canceled", "annule", "annulé", "disabled", "desactive",
  "désactivé", "deleted", "supprime", "supprimé",
]);
const DRAFT_STATUSES = new Set(["brouillon", "draft"]);
export const MIN_LAUNCH_UNIQUE_PLAYERS = 10;
export const MIN_LAUNCH_PARTICIPATIONS = 20;

export type PublicationState = "disabled" | "hidden" | "published" | "published_inconsistent" | "draft";

export type PublicationGame = {
  status?: unknown;
  deleted?: unknown;
  visible_public?: unknown;
  visible_public_auto_published?: unknown;
  unique_players_count?: unknown;
  participations?: unknown;
};

function normalizedStatus(game: PublicationGame) {
  return typeof game.status === "string" ? game.status.trim().toLowerCase() : "";
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function hasLaunchEvidence(game: PublicationGame) {
  const uniquePlayers = count(game.unique_players_count);
  if (uniquePlayers !== null) return uniquePlayers >= MIN_LAUNCH_UNIQUE_PLAYERS;
  return (count(game.participations) ?? 0) >= MIN_LAUNCH_PARTICIPATIONS;
}

export function gamePublicationState(game: PublicationGame): PublicationState {
  const status = normalizedStatus(game);
  if (game.deleted === true || CLOSED_STATUSES.has(status)) return "disabled";
  if (game.visible_public === false && game.visible_public_auto_published === true) return "hidden";
  const draftFlagged = game.visible_public === false || DRAFT_STATUSES.has(status);
  if (!draftFlagged) return "published";
  return hasLaunchEvidence(game) ? "published_inconsistent" : "draft";
}

export type AdminGameStatus = "actif" | "expire" | "brouillon" | "prive" | "desactive";

type AdminStatusInput = PublicationGame & {
  isPrivate?: unknown;
  endMs: number | null;
  startMs: number | null;
};

// Admin display: one reliable status, plus an alert when the stored fields
// disagree with what players actually experience. The alert never blocks.
export function adminGameState(game: AdminStatusInput, now = Date.now()): {
  status: AdminGameStatus;
  publicationAlert: string | null;
} {
  const state = gamePublicationState(game);
  const status = normalizedStatus(game);
  const uniquePlayers = count(game.unique_players_count);
  const participations = count(game.participations) ?? 0;
  let publicationAlert: string | null = null;
  if (state === "published_inconsistent") {
    const players = uniquePlayers !== null ? `${uniquePlayers} joueurs` : `${participations} participations`;
    publicationAlert = `Joué par ${players} mais enregistré en brouillon : activez-le pour régulariser.`;
  } else if (state === "draft" && participations > 0) {
    publicationAlert = `${participations} participation(s) sur un brouillon non publié : à vérifier.`;
  } else if (state === "draft" && (status === "actif" || status === "active")) {
    publicationAlert = "Statut actif mais jeu non publié : à vérifier.";
  }

  if (state === "disabled" || state === "hidden") return {status: "desactive", publicationAlert};
  if (game.endMs !== null && game.endMs < now) return {status: "expire", publicationAlert};
  if (status === "prive" || status === "privé" || status === "private" || game.isPrivate === true) {
    return {status: "prive", publicationAlert};
  }
  if (state === "draft") return {status: "brouillon", publicationAlert};
  if (game.startMs !== null && game.startMs > now) return {status: "brouillon", publicationAlert};
  return {status: "actif", publicationAlert};
}
