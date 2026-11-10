// Campagnes QR (bus, flyers, affiches, commerces, reseaux sociaux).
//
// Parcours : QR -> https://proxiplay.fr/<chemin> -> reecriture Vercel du site
// vers la route publique de l'Admin (/api/public/qr/<chemin>) -> 302 immediat
// vers la destination -> comptage apres la reponse (next/server after()).
//
// Mesure minimale (RGPD) : uniquement des compteurs agreges par heure. Aucun
// identifiant, aucune adresse IP, aucun navigateur, aucun cookie n'est
// enregistre. On mesure des OUVERTURES de l'URL, jamais des scans, des
// visiteurs uniques, des telechargements ni des installations.
//
// Ce module ne contient que de la logique pure, testable sans Firebase.

export const QR_CAMPAIGNS_COLLECTION = "qr_campaigns";
export const QR_CAMPAIGN_SLUGS_COLLECTION = "qr_campaign_slugs";
export const QR_HOURLY_STATS_SUBCOLLECTION = "hourly_stats";
export const QR_CAMPAIGN_CHANGES_SUBCOLLECTION = "changes";

/**
 * Compteurs horaires repartis sur quelques documents pour absorber les
 * pointes (recommandation Firestore : environ une ecriture par seconde et
 * par document). 4 documents par heure suffisent largement au-dela de
 * 10 000 ouvertures par jour ; les statistiques les additionnent.
 */
export const QR_STATS_SHARDS = 4;

export const PUBLIC_SITE_ORIGIN = "https://proxiplay.fr";
/** Lien de telechargement de l'app : destination de secours. */
export const DEFAULT_APP_DESTINATION = "https://onelink.to/jx4ee7";
export const SITE_HOME_URL = "https://www.proxiplay.fr/";

/**
 * Chemins courts servis a la racine du site (une ligne de reecriture dans
 * le vercel.json du site par chemin). Les autres campagnes utilisent
 * https://proxiplay.fr/c/<chemin>, sans deploiement du site.
 */
export const QR_VANITY_SLUGS: readonly string[] = ["bus"];

/** Pages et dossiers du site : jamais utilises comme chemin de campagne. */
export const QR_RESERVED_SLUGS: readonly string[] = [
  "academie", "api", "assets", "c", "commerces", "components", "content", "data", "docs",
  "espace-commercant", "images", "index", "j", "joueurs", "legal", "mentions-legales",
  "robots", "seo", "sitemap", "solution-commercants", "suppression-compte", "templates",
  "villes", "well-known", "www", "admin", "play", "app",
];

export const QR_CAMPAIGN_STATUSES = ["draft", "active", "paused", "archived"] as const;
export type QrCampaignStatus = (typeof QR_CAMPAIGN_STATUSES)[number];

export const QR_STATUS_LABELS: Record<QrCampaignStatus, string> = {
  draft: "À préparer",
  active: "Active",
  paused: "En pause",
  archived: "Archivée",
};

export const QR_CAMPAIGN_CHANNELS = ["bus", "flyer", "affiche", "commerce", "reseaux_sociaux", "autre"] as const;
export type QrCampaignChannel = (typeof QR_CAMPAIGN_CHANNELS)[number];

export const QR_CHANNEL_LABELS: Record<QrCampaignChannel, string> = {
  bus: "Bus",
  flyer: "Flyers",
  affiche: "Affiches",
  commerce: "Commerces partenaires",
  reseaux_sociaux: "Réseaux sociaux",
  autre: "Autre",
};

/** Destinations autorisees : https, sans identifiants ni port. */
export const QR_ALLOWED_DESTINATION_HOSTS: readonly string[] = [
  "onelink.to", "apps.apple.com", "play.google.com",
  "proxiplay.fr", "www.proxiplay.fr", "play.proxiplay.fr",
];

export type QrDevice = "ios" | "android" | "other";

export type QrCounterField =
  | "opens" | "ios" | "android" | "other"
  | "excluded_automated" | "outside_campaign" | "fallback_redirects";

export const QR_COUNTER_FIELDS: readonly QrCounterField[] = [
  "opens", "ios", "android", "other", "excluded_automated", "outside_campaign", "fallback_redirects",
];

export function isQrCampaignStatus(value: unknown): value is QrCampaignStatus {
  return typeof value === "string" && (QR_CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

export function isQrCampaignChannel(value: unknown): value is QrCampaignChannel {
  return typeof value === "string" && (QR_CAMPAIGN_CHANNELS as readonly string[]).includes(value);
}

/** Identifiant interne, ex. bus_dunkerque. */
export function isValidQrCampaignId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9](?:[a-z0-9_]{1,38}[a-z0-9])$/.test(value);
}

/** Chemin public, ex. bus -> proxiplay.fr/bus. */
export function isValidQrSlugFormat(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(value);
}

export function validateQrSlug(value: unknown): string | null {
  if (!isValidQrSlugFormat(value)) {
    return "Chemin invalide : lettres minuscules, chiffres et tirets, 1 à 40 caractères.";
  }
  if (QR_RESERVED_SLUGS.includes(value)) {
    return "Ce chemin est réservé à une page du site.";
  }
  return null;
}

export function validateQrDestination(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 500) {
    return "Destination obligatoire (500 caractères au plus).";
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return "Destination invalide : adresse complète attendue (https://…).";
  }
  if (url.protocol !== "https:") return "La destination doit commencer par https://.";
  if (url.username || url.password || url.port) return "Destination invalide (identifiants ou port interdits).";
  if (!QR_ALLOWED_DESTINATION_HOSTS.includes(url.hostname.toLowerCase())) {
    return `Destination non autorisée. Domaines acceptés : ${QR_ALLOWED_DESTINATION_HOSTS.join(", ")}.`;
  }
  return null;
}

export function isAllowedQrDestination(value: unknown): value is string {
  return validateQrDestination(value) === null;
}

/** URL a encoder dans le QR code : stable, independante de la destination. */
export function qrPublicUrl(slug: string): string {
  return QR_VANITY_SLUGS.includes(slug) ? `${PUBLIC_SITE_ORIGIN}/${slug}` : `${PUBLIC_SITE_ORIGIN}/c/${slug}`;
}

/** Categorie d'appareil estimee a partir du navigateur annonce (jamais stocke). */
export function classifyQrDevice(userAgent: string | null | undefined): QrDevice {
  const ua = userAgent ?? "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
}

const AUTOMATED_AGENT = /bot\b|bot\/|crawler|spider|crawl|slurp|preview|facebookexternalhit|facebot|whatsapp|telegrambot|slackbot|discordbot|twitterbot|linkedinbot|skypeuripreview|embedly|pinterest|vkshare|w3c_validator|headlesschrome|python-requests|curl\/|wget\/|okhttp|go-http-client|axios\/|node-fetch|httpclient|java\//i;

/**
 * Requetes ecartees du comptage (toujours redirigees) : robots, apercus de
 * liens, prechargements. Renvoie la raison, ou null pour une ouverture.
 */
export function automatedQrRequestReason(input: {
  method: string;
  userAgent: string | null;
  purpose?: string | null;
  secPurpose?: string | null;
  xPurpose?: string | null;
  xMoz?: string | null;
}): "head" | "missing_agent" | "bot" | "prefetch" | null {
  if (input.method.toUpperCase() === "HEAD") return "head";
  const ua = (input.userAgent ?? "").trim();
  if (!ua) return "missing_agent";
  if (AUTOMATED_AGENT.test(ua)) return "bot";
  const purposes = [input.purpose, input.secPurpose, input.xPurpose, input.xMoz]
    .map((value) => (value ?? "").toLowerCase());
  if (purposes.some((value) => value.includes("prefetch") || value.includes("prerender") || value.includes("preview"))) {
    return "prefetch";
  }
  return null;
}

const parisParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
});

/** Jour (AAAA-MM-JJ) et heure (0-23) a Paris, changements d'heure compris. */
export function parisHourBucket(date: Date): { date: string; hour: number } {
  const parts = Object.fromEntries(parisParts.formatToParts(date).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}

export function qrStatsDocId(day: string, hour: number, shard: number): string {
  return `${day}_${String(hour).padStart(2, "0")}_${shard}`;
}

/** Decalage (minutes) de Paris par rapport a UTC a un instant donne. */
function parisOffsetMinutes(at: Date): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(at).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** « AAAA-MM-JJTHH:MM » saisi en heure de Paris -> instant, ou null. */
export function parseParisDateTimeInput(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const probe = new Date(naive);
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day ||
      hour > 23 || minute > 59) return null;
  const first = new Date(naive - parisOffsetMinutes(probe) * 60000);
  return new Date(naive - parisOffsetMinutes(first) * 60000);
}

/** Instant -> « AAAA-MM-JJTHH:MM » en heure de Paris (champ datetime-local). */
export function formatParisDateTimeInput(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${String(Number(parts.hour) % 24).padStart(2, "0")}:${parts.minute}`;
}

/** Ouverture comptee dans la campagne : active et lancee. */
export function isQrCampaignLive(status: QrCampaignStatus, launchAt: Date | null, now: Date): boolean {
  return status === "active" && (!launchAt || launchAt.getTime() <= now.getTime());
}

/** Increments d'une requete (un seul document ecrit par requete). */
export function qrCounterIncrements(input: {
  automated: boolean;
  live: boolean;
  device: QrDevice;
  fallback: boolean;
}): Partial<Record<QrCounterField, number>> {
  const increments: Partial<Record<QrCounterField, number>> = {};
  if (input.automated) increments.excluded_automated = 1;
  else if (!input.live) increments.outside_campaign = 1;
  else {
    increments.opens = 1;
    increments[input.device] = 1;
  }
  if (input.fallback) increments.fallback_redirects = 1;
  return increments;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const QR_STATS_MAX_DAYS = 366;

export function isValidDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/** Jours de la periode, bornes comprises (null si invalide ou trop longue). */
export function listDayKeys(from: string, to: string): string[] | null {
  if (!isValidDayKey(from) || !isValidDayKey(to) || from > to) return null;
  const days: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    if (days.length > QR_STATS_MAX_DAYS) return null;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export type QrHourlyStatsDoc = { date?: unknown; hour?: unknown } & Partial<Record<QrCounterField, unknown>>;

export type QrCampaignStats = {
  from: string;
  to: string;
  totals: Record<QrCounterField, number>;
  daily: { date: string; opens: number }[];
  hourly: number[];
  devices: { ios: number; android: number; other: number };
};

function counter(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Additionne les documents horaires (toutes repartitions) sur la periode. */
export function aggregateQrStats(docs: QrHourlyStatsDoc[], from: string, to: string): QrCampaignStats | null {
  const days = listDayKeys(from, to);
  if (!days) return null;
  const totals = Object.fromEntries(QR_COUNTER_FIELDS.map((field) => [field, 0])) as Record<QrCounterField, number>;
  const perDay = new Map(days.map((day) => [day, 0]));
  const hourly = Array.from({ length: 24 }, () => 0);
  for (const doc of docs) {
    if (typeof doc.date !== "string" || !perDay.has(doc.date)) continue;
    const hour = typeof doc.hour === "number" && Number.isInteger(doc.hour) && doc.hour >= 0 && doc.hour < 24 ? doc.hour : null;
    for (const field of QR_COUNTER_FIELDS) totals[field] += counter(doc[field]);
    const opens = counter(doc.opens);
    perDay.set(doc.date, (perDay.get(doc.date) ?? 0) + opens);
    if (hour !== null) hourly[hour] += opens;
  }
  return {
    from,
    to,
    totals,
    daily: days.map((date) => ({ date, opens: perDay.get(date) ?? 0 })),
    hourly,
    devices: { ios: totals.ios, android: totals.android, other: totals.other },
  };
}

export function formatQrPercent(part: number, total: number): string {
  if (!total) return "0 %";
  return `${Math.round((part / total) * 100)} %`;
}
