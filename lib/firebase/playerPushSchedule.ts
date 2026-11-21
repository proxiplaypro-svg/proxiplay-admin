const parisFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

// Reactivate only after the deployed scheduled processor has been corrected and verified.
export const PLAYER_PUSH_SCHEDULING_ENABLED = false;

export function resolvePlayerPushScheduledTime(
  mode: "now" | "later",
  localValue: string,
  nowMs: number = Date.now(),
  schedulingEnabled: boolean = PLAYER_PUSH_SCHEDULING_ENABLED,
): number | undefined {
  if (mode === "now") return undefined;
  if (!schedulingEnabled) throw new Error("Programmation indisponible : correction des fonctions en attente.");
  return parseParisScheduledTime(localValue, nowMs);
}

function parisParts(timestamp: number) {
  return Object.fromEntries(parisFormatter.formatToParts(timestamp)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]));
}

export function parseParisScheduledTime(value: string, nowMs: number = Date.now()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Indique une date et une heure de Paris valides.");
  const [, year, month, day, hour, minute] = match;
  const wallUtc = Date.UTC(+year, +month - 1, +day, +hour, +minute);
  const wallDate = new Date(wallUtc);
  if (wallDate.getUTCFullYear() !== +year || wallDate.getUTCMonth() + 1 !== +month ||
      wallDate.getUTCDate() !== +day || wallDate.getUTCHours() !== +hour || wallDate.getUTCMinutes() !== +minute) {
    throw new Error("La date de programmation est invalide.");
  }

  const matches = [60, 120].map((offset) => wallUtc - offset * 60_000)
    .filter((timestamp) => {
      const parts = parisParts(timestamp);
      return parts.year === year && parts.month === month && parts.day === day &&
        parts.hour === hour && parts.minute === minute;
    });
  if (matches.length !== 1) {
    throw new Error(matches.length ? "Cette heure de Paris est ambiguë lors du changement d’heure. Choisis une autre heure."
      : "Cette heure de Paris n’existe pas lors du changement d’heure.");
  }
  if (matches[0] - nowMs < 2 * 60_000) {
    throw new Error("Programme l’envoi au moins 2 minutes dans le futur (heure de Paris).");
  }
  return matches[0];
}

export function formatParisScheduledTime(timestamp: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short",
  }).format(new Date(timestamp));
}
