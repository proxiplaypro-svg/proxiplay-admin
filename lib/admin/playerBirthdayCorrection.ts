// Correction de la date de naissance d'un joueur par le support : passe par
// la Cloud Function callable adminCorrectPlayerBirthday (depot canonique,
// us-central1). Depuis le verrouillage des regles Firestore (1.1.4), c'est la
// seule voie pour modifier une date deja enregistree.
//
// Parametres attendus par la fonction (player_birthday_correction.js) :
//   userId   : identifiant du compte (sans « / », 128 caracteres max)
//   birthday : « AAAA-MM-JJ », date reelle entre 1900 et aujourd'hui (Paris)
//   reason   : motif, 5 a 200 caracteres apres normalisation des espaces
//
// La fonction journalise la correction (tranches d'age seulement, jamais les
// dates) et retire le consentement marketing si le joueur passe sous 15 ans.

export const BIRTHDAY_CORRECTION_REASON_MIN = 5;
export const BIRTHDAY_CORRECTION_REASON_MAX = 200;

export type BirthdayCorrectionPayload = {
  userId: string;
  birthday: string;
  reason: string;
};

export type AgeBand = "under_15" | "15_17" | "18_plus" | "unknown";

export type BirthdayCorrectionResult = {
  changed: boolean;
  correctionId?: string;
  previousAgeBand: AgeBand;
  newAgeBand: AgeBand;
  marketingConsentWithdrawn: boolean;
};

/** Jour calendaire a Paris, « AAAA-MM-JJ » (borne max du champ date). */
export function parisTodayKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function isRealCalendarDay(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/** Memes controles que la fonction serveur, pour un message immediat. */
export function buildBirthdayCorrectionPayload(
  input: { userId: string; birthday: string; reason: string },
  now: Date = new Date(),
): { ok: true; payload: BirthdayCorrectionPayload } | { ok: false; error: string } {
  const userId = input.userId.trim();
  if (!userId || userId.includes("/") || userId.length > 128) {
    return { ok: false, error: "Joueur invalide." };
  }
  const birthday = input.birthday.trim();
  if (!isRealCalendarDay(birthday) || birthday < "1900-01-01" || birthday > parisTodayKey(now)) {
    return { ok: false, error: "Date de naissance invalide (entre le 01/01/1900 et aujourd'hui)." };
  }
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (reason.length < BIRTHDAY_CORRECTION_REASON_MIN || reason.length > BIRTHDAY_CORRECTION_REASON_MAX) {
    return {
      ok: false,
      error: `Le motif est obligatoire (${BIRTHDAY_CORRECTION_REASON_MIN} à ${BIRTHDAY_CORRECTION_REASON_MAX} caractères).`,
    };
  }
  return { ok: true, payload: { userId, birthday, reason } };
}

const AGE_BAND_LABELS: Record<AgeBand, string> = {
  under_15: "moins de 15 ans",
  "15_17": "15 à 17 ans",
  "18_plus": "18 ans et plus",
  unknown: "date inconnue",
};

export function ageBandLabel(band: unknown): string {
  return AGE_BAND_LABELS[band as AgeBand] ?? AGE_BAND_LABELS.unknown;
}

/** Compte rendu affiche apres l'appel : jamais la date elle-meme. */
export function birthdayCorrectionSummary(result: BirthdayCorrectionResult): string {
  if (!result.changed) {
    return "Date identique à celle enregistrée : aucune modification.";
  }
  const parts = [
    `Date de naissance corrigée (${ageBandLabel(result.previousAgeBand)} → ${ageBandLabel(result.newAgeBand)}).`,
  ];
  if (result.marketingConsentWithdrawn) {
    parts.push("Moins de 15 ans : le consentement marketing a été retiré.");
  }
  return parts.join(" ");
}

/** Message affiche a l'admin : celui de la fonction serveur quand elle en donne un. */
export function birthdayCorrectionErrorMessage(error: unknown): string {
  const code = typeof (error as { code?: unknown })?.code === "string" ?
    String((error as { code: string }).code).replace(/^functions\//, "") : "";
  const message = typeof (error as { message?: unknown })?.message === "string" ?
    String((error as { message: string }).message).trim() : "";
  if (code === "unauthenticated") return "Session expirée : reconnectez-vous.";
  if (code === "permission-denied") return "Correction réservée à l'administration.";
  if (code === "not-found" && !message) return "Joueur introuvable.";
  if (["invalid-argument", "failed-precondition", "not-found"].includes(code) && message &&
      message.toLowerCase() !== code) {
    return message;
  }
  return "Impossible de corriger la date de naissance. Réessayez dans un instant.";
}
