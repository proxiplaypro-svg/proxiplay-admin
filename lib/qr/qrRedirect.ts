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
  /** Apres un echec ou une lecture lente, repli immediat pendant cette duree. */
  failureBackoffMs?: number;
  /** Attente maximale d'une lecture lente avant comptage differe. */
  deferredLookupTimeoutMs?: number;
  log?: (message: string) => void;
};

export type QrRedirectResult = {
  response: Response;
  task: (() => Promise<void>) | null;
  /** Pour les tests et le diagnostic. */
  outcome: "counted" | "outside_campaign" | "automated" | "head" | "burst" | "capped" | "unknown_slug" | "invalid_slug"
    /** Lecture lente : comptage differe jusqu'a la fin de la lecture (after()). */
    | "deferred"
    /** Lecture impossible : redirection de secours, rien a compter. */
    | "uncounted";
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
export async function burstKey(slug: string, request: Request): Promise<string | null> {
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
  const deferredLookupTimeoutMs = options.deferredLookupTimeoutMs ?? 8_000;

  type Resolved = {
    target: QrRedirectTarget | null;
    fallback: boolean;
    /** Lecture encore en cours : le comptage l'attendra apres la reponse. */
    pending?: Promise<QrRedirectTarget | null>;
  };
  const cache = new Map<string, { target: QrRedirectTarget | null; fallback: boolean; fetchedAt: number }>();
  // Apres une lecture lente ou en echec, les requetes suivantes n'attendent
  // plus : repli immediat pendant failureBackoffMs (ou jusqu'a la fin de la
  // lecture en cours, qui remplit le cache).
  const degradedUntil = new Map<string, number>();
  // Une seule lecture en cours par chemin, partagee par les requetes.
  const inflight = new Map<string, Promise<QrRedirectTarget | null>>();
  const recent = new Map<string, number>();
  let writes = { day: "", count: 0 };

  /** Cible utilisable, ou repli sur le lien de telechargement si invalide. */
  function normalize(slug: string, target: QrRedirectTarget | null): { target: QrRedirectTarget | null; fallback: boolean } {
    if (!target) return { target: null, fallback: false };
    if (isAllowedQrDestination(target.destination) && isQrCampaignStatus(target.status)) return { target, fallback: false };
    log(`[qr] campagne ${slug} : destination ou statut invalide, repli`);
    // Jamais suivie : lien de telechargement, compte hors campagne.
    return { target: { campaignId: target.campaignId, destination: DEFAULT_APP_DESTINATION, status: "paused", launchAt: null }, fallback: true };
  }

  function lookup(slug: string): Promise<QrRedirectTarget | null> {
    const running = inflight.get(slug);
    if (running) return running;
    const promise = options.store.findBySlug(slug).then(
      (target) => {
        cache.set(slug, { ...normalize(slug, target), fetchedAt: now().getTime() });
        degradedUntil.delete(slug);
        return target;
      },
      (error) => {
        log(`[qr] lecture de ${slug} impossible (erreur), repli`);
        degradedUntil.set(slug, now().getTime() + failureBackoffMs);
        throw error;
      },
    ).finally(() => inflight.delete(slug));
    // Une lecture abandonnee par toutes les requetes ne doit jamais lever
    // d'exception non geree.
    promise.catch(() => undefined);
    inflight.set(slug, promise);
    return promise;
  }

  function fallbackFor(slug: string, pending?: Promise<QrRedirectTarget | null>): Resolved {
    const cached = cache.get(slug);
    if (cached?.target) return { target: cached.target, fallback: true };
    // Chemin pas encore connu de cette instance : lien de telechargement ;
    // le comptage attendra la lecture en cours, s'il y en a une.
    return { target: { campaignId: "", destination: DEFAULT_APP_DESTINATION, status: "paused", launchAt: null }, fallback: true, pending };
  }

  async function resolve(slug: string): Promise<Resolved> {
    const cached = cache.get(slug);
    const nowMs = now().getTime();
    if (cached && nowMs - cached.fetchedAt < cacheTtlMs) return { target: cached.target, fallback: cached.fallback };
    if ((degradedUntil.get(slug) ?? 0) > nowMs) return fallbackFor(slug, inflight.get(slug));
    const pending = lookup(slug);
    try {
      const target = await withTimeout(pending, resolveTimeoutMs);
      return normalize(slug, target);
    } catch (error) {
      if (!(error instanceof TimeoutError)) return fallbackFor(slug);
      log(`[qr] lecture de ${slug} lente (délai dépassé), repli`);
      degradedUntil.set(slug, nowMs + failureBackoffMs);
      return fallbackFor(slug, pending);
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
    const resolved = await resolve(slug);
    const { target, fallback } = resolved;
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
    if (reason === "head") {
      return { response, task: null, outcome: "head", fallback };
    }
    if (!target.campaignId && !resolved.pending) {
      return { response, task: null, outcome: "uncounted", fallback };
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
    const shard = Math.min(QR_STATS_SHARDS - 1, Math.floor(random() * QR_STATS_SHARDS));
    const device = classifyQrDevice(request.headers.get("user-agent"));
    const record = async (campaign: QrRedirectTarget) => {
      const update: QrHourlyIncrement = {
        campaignId: campaign.campaignId,
        docId: qrStatsDocId(bucket.date, bucket.hour, shard),
        date: bucket.date,
        hour: bucket.hour,
        shard,
        increments: qrCounterIncrements({
          automated,
          live: isQrCampaignLive(campaign.status, campaign.launchAt, at),
          device,
          fallback,
        }),
      };
      try {
        await withTimeout(options.store.increment(update), writeTimeoutMs);
      } catch (error) {
        log(`[qr] comptage de ${slug} non enregistré (${error instanceof TimeoutError ? "délai dépassé" : "erreur"})`);
      }
    };
    if (!target.campaignId && resolved.pending) {
      const pending = resolved.pending;
      // Comptage differe : la redirection est deja partie ; on attend la fin
      // de la lecture lente (instance froide), puis on compte, repli signale.
      const task = async () => {
        let campaign: QrRedirectTarget | null = null;
        try {
          campaign = normalize(slug, await withTimeout(pending, deferredLookupTimeoutMs)).target;
        } catch {
          log(`[qr] comptage différé de ${slug} abandonné (lecture impossible)`);
          return;
        }
        if (campaign?.campaignId) await record(campaign);
      };
      return { response, task, outcome: "deferred", fallback };
    }
    const live = isQrCampaignLive(target.status, target.launchAt, at);
    return { response, task: () => record(target), outcome: automated ? "automated" : live ? "counted" : "outside_campaign", fallback };
  }

  return { handle };
}
