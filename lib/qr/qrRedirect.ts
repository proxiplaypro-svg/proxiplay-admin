// Redirection publique des campagnes QR : la reponse 302 part TOUJOURS
// avant toute ecriture. Le comptage est renvoye sous forme de tache, que la
// route confie a after() (next/server, waitUntil sur Vercel).
//
// Pannes : Firestore lent (au-dela de resolveTimeoutMs) ou indisponible ->
// derniere destination connue de cette instance, sinon lien de
// telechargement par defaut. Une erreur de comptage est journalisee sans
// donnee personnelle et n'a aucun effet sur l'utilisateur.

import {
  DEFAULT_APP_DESTINATION,
  QR_STATS_SHARDS,
  SITE_HOME_URL,
  automatedQrRequestReason,
  classifyQrDevice,
  isAllowedQrDestination,
  isQrCampaignLive,
  isQrCampaignStatus,
  isValidQrSlugFormat,
  parisHourBucket,
  qrCounterIncrements,
  qrStatsDocId,
  type QrCampaignStatus,
  type QrCounterField,
} from "@/lib/admin/qrCampaigns";

export type QrRedirectTarget = {
  campaignId: string;
  destination: string;
  status: QrCampaignStatus;
  launchAt: Date | null;
};

export type QrHourlyIncrement = {
  campaignId: string;
  docId: string;
  date: string;
  hour: number;
  shard: number;
  increments: Partial<Record<QrCounterField, number>>;
};

export interface QrRedirectStore {
  /** null : chemin inconnu. Une exception : lecture impossible. */
  findBySlug(slug: string): Promise<QrRedirectTarget | null>;
  increment(update: QrHourlyIncrement): Promise<void>;
}

export type QrRedirectOptions = {
  store: QrRedirectStore;
  now?: () => Date;
  random?: () => number;
  resolveTimeoutMs?: number;
  cacheTtlMs?: number;
  writeTimeoutMs?: number;
  /** Plafond d'ecritures par instance et par jour (protection des couts). */
  dailyWriteCap?: number;
  /** Une meme origine n'est comptee qu'une fois par fenetre (memoire seule). */
  burstWindowMs?: number;
  /** Apres un echec de lecture, repli immediat pendant cette duree. */
  failureBackoffMs?: number;
  log?: (message: string) => void;
};

export type QrRedirectResult = {
  response: Response;
  task: (() => Promise<void>) | null;
  /** Pour les tests et le diagnostic. */
  outcome: "counted" | "outside_campaign" | "automated" | "head" | "burst" | "capped" | "unknown_slug" | "invalid_slug";
  fallback: boolean;
};

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError("timeout")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function redirectResponse(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      // Jamais mise en cache : une destination modifiee s'applique aussitot.
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

/** Cle ephemere d'une origine (jamais stockee ni journalisee). */
async function burstKey(slug: string, request: Request): Promise<string | null> {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() || "";
  if (!forwarded) return null;
  const data = new TextEncoder().encode(`${slug}|${forwarded}|${request.headers.get("user-agent") ?? ""}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(digest).toString("base64url").slice(0, 22);
}

export function createQrRedirectHandler(options: QrRedirectOptions) {
  const now = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;
  const resolveTimeoutMs = options.resolveTimeoutMs ?? 500;
  const cacheTtlMs = options.cacheTtlMs ?? 60_000;
  const writeTimeoutMs = options.writeTimeoutMs ?? 3_000;
  const dailyWriteCap = options.dailyWriteCap ?? 20_000;
  const burstWindowMs = options.burstWindowMs ?? 30_000;
  const log = options.log ?? ((message: string) => console.warn(message));

  const failureBackoffMs = options.failureBackoffMs ?? 10_000;

  type Resolved = { target: QrRedirectTarget | null; fallback: boolean };
  const cache = new Map<string, Resolved & { fetchedAt: number }>();
  // Apres un echec de lecture, les requetes suivantes n'attendent plus le
  // delai maximal : repli immediat pendant failureBackoffMs.
  const failedUntil = new Map<string, number>();
  const recent = new Map<string, number>();
  let writes = { day: "", count: 0 };

  function fallbackFor(cached: Resolved | undefined): Resolved {
    if (cached?.target) return { target: cached.target, fallback: true };
    // Chemin inconnu de cette instance : le lien de telechargement, sans comptage.
    return { target: { campaignId: "", destination: DEFAULT_APP_DESTINATION, status: "paused", launchAt: null }, fallback: true };
  }

  async function resolve(slug: string): Promise<Resolved> {
    const cached = cache.get(slug);
    const nowMs = now().getTime();
    if (cached && nowMs - cached.fetchedAt < cacheTtlMs) return { target: cached.target, fallback: cached.fallback };
    if ((failedUntil.get(slug) ?? 0) > nowMs) return fallbackFor(cached);
    try {
      const target = await withTimeout(options.store.findBySlug(slug), resolveTimeoutMs);
      failedUntil.delete(slug);
      let resolved: Resolved;
      if (!target) resolved = { target: null, fallback: false };
      else if (isAllowedQrDestination(target.destination) && isQrCampaignStatus(target.status)) resolved = { target, fallback: false };
      else {
        log(`[qr] campagne ${slug} : destination ou statut invalide, repli`);
        // Jamais suivie : lien de telechargement, compte hors campagne.
        resolved = { target: { campaignId: target.campaignId, destination: DEFAULT_APP_DESTINATION, status: "paused", launchAt: null }, fallback: true };
      }
      cache.set(slug, { ...resolved, fetchedAt: nowMs });
      return resolved;
    } catch (error) {
      log(`[qr] lecture de ${slug} impossible (${error instanceof TimeoutError ? "délai dépassé" : "erreur"}), repli`);
      failedUntil.set(slug, nowMs + failureBackoffMs);
      return fallbackFor(cached);
    }
  }

  function takeWriteBudget(day: string): boolean {
    if (writes.day !== day) writes = { day, count: 0 };
    if (writes.count >= dailyWriteCap) return false;
    writes.count += 1;
    return true;
  }

  function isBurst(key: string | null, nowMs: number): boolean {
    if (!key) return false;
    if (recent.size > 10_000) {
      for (const [entry, at] of recent) if (nowMs - at >= burstWindowMs) recent.delete(entry);
      if (recent.size > 10_000) recent.clear();
    }
    const last = recent.get(key);
    recent.set(key, nowMs);
    return last !== undefined && nowMs - last < burstWindowMs;
  }

  async function handle(request: Request, rawSlug: string): Promise<QrRedirectResult> {
    const slug = (rawSlug ?? "").toLowerCase();
    if (!isValidQrSlugFormat(slug)) {
      return { response: redirectResponse(SITE_HOME_URL), task: null, outcome: "invalid_slug", fallback: false };
    }
    const { target, fallback } = await resolve(slug);
    if (!target) {
      return { response: redirectResponse(SITE_HOME_URL), task: null, outcome: "unknown_slug", fallback: false };
    }
    const response = redirectResponse(target.destination);
    const reason = automatedQrRequestReason({
      method: request.method,
      userAgent: request.headers.get("user-agent"),
      purpose: request.headers.get("purpose"),
      secPurpose: request.headers.get("sec-purpose"),
      xPurpose: request.headers.get("x-purpose"),
      xMoz: request.headers.get("x-moz"),
    });
    if (reason === "head" || !target.campaignId) {
      return { response, task: null, outcome: "head", fallback };
    }
    const at = now();
    const automated = reason !== null;
    if (!automated && isBurst(await burstKey(slug, request), at.getTime())) {
      return { response, task: null, outcome: "burst", fallback };
    }
    const bucket = parisHourBucket(at);
    if (!takeWriteBudget(bucket.date)) {
      return { response, task: null, outcome: "capped", fallback };
    }
    const live = isQrCampaignLive(target.status, target.launchAt, at);
    const shard = Math.min(QR_STATS_SHARDS - 1, Math.floor(random() * QR_STATS_SHARDS));
    const update: QrHourlyIncrement = {
      campaignId: target.campaignId,
      docId: qrStatsDocId(bucket.date, bucket.hour, shard),
      date: bucket.date,
      hour: bucket.hour,
      shard,
      increments: qrCounterIncrements({
        automated,
        live,
        device: classifyQrDevice(request.headers.get("user-agent")),
        fallback,
      }),
    };
    const task = async () => {
      try {
        await withTimeout(options.store.increment(update), writeTimeoutMs);
      } catch (error) {
        log(`[qr] comptage de ${slug} non enregistré (${error instanceof TimeoutError ? "délai dépassé" : "erreur"})`);
      }
    };
    return { response, task, outcome: automated ? "automated" : live ? "counted" : "outside_campaign", fallback };
  }

  return { handle };
}
