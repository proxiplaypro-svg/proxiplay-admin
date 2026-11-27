// Affichage de l'acceptation des CGV commerçant dans la fiche.
// Source : la trace merchant_cgv_acceptances/{uid}/history/{version}, écrite
// uniquement par la callable recordMerchantCgvAcceptance (SDK Admin) et
// refusée par défaut aux clients. On ne lit pas users/{uid}.cgv_accepted_version
// pour l'affichage : la règle de création de users/{uid} n'interdit pas ce
// champ, un client pourrait donc le poser lui-même à la création de sa fiche.

export type MerchantCgvStatus = { cgvAcceptedVersion: string | null; cgvAcceptedAt: string | null };

function twoDigits(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find(part => part.type === type)?.value ?? "";
}

export function merchantCgvLabel(status: Partial<MerchantCgvStatus> | null | undefined): string {
  const version = typeof status?.cgvAcceptedVersion === "string" ? status.cgvAcceptedVersion.trim() : "";
  if (!version) return "CGV non acceptées";
  const at = status?.cgvAcceptedAt ? new Date(status.cgvAcceptedAt) : null;
  if (!at || Number.isNaN(at.getTime())) return `CGV v${version} acceptées`;
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const date = `${twoDigits(parts, "day")}/${twoDigits(parts, "month")}/${twoDigits(parts, "year")}`;
  const time = `${twoDigits(parts, "hour")}:${twoDigits(parts, "minute")}`;
  return `CGV v${version} acceptées le ${date} à ${time}`;
}

export function readMerchantCgvStatus(history: Record<string, unknown> | undefined): MerchantCgvStatus {
  const version = typeof history?.cgv_version === "string" && history.cgv_version.trim() ? history.cgv_version.trim() : null;
  const raw = history?.accepted_at as { toDate?: () => Date } | undefined;
  const date = raw && typeof raw.toDate === "function" ? raw.toDate() : null;
  return { cgvAcceptedVersion: version, cgvAcceptedAt: version && date && !Number.isNaN(date.getTime()) ? date.toISOString() : null };
}
