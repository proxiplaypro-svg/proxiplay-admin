import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin-app";
import OpenAppRedirect from "./OpenAppRedirect";

type TimestampLike = {
  toMillis?: () => number;
};

type FirestoreGameDocument = {
  title?: string;
  name?: string;
  description?: string;
  conditions?: string;
  merchantName?: string;
  enseigne_name?: string;
  imageUrl?: string;
  photo?: string;
  coverUrl?: string;
  start_date?: TimestampLike | null;
  startDate?: TimestampLike | null;
  end_date?: TimestampLike | null;
  endDate?: TimestampLike | null;
  prohibited_for_minors?: boolean;
  restrictedToAdults?: boolean;
};

type PublicGame = {
  id: string;
  title: string;
  description: string;
  merchantName: string;
  imageUrl: string | null;
  startDateValue: number | null;
  endDateValue: number | null;
  restrictedToAdults: boolean;
};

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.proxiplay.proxiplay";
const APP_PACKAGE_NAME = "com.proxiplay.proxiplay";
const WEB_BASE_URL = "https://proxiplay.fr";

function readText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function readMillis(...values: Array<TimestampLike | null | undefined>) {
  for (const value of values) {
    const millis = value?.toMillis?.();

    if (typeof millis === "number" && Number.isFinite(millis)) {
      return millis;
    }
  }

  return null;
}

function formatDate(value: number | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function buildDateRange(startDateValue: number | null, endDateValue: number | null) {
  const startLabel = formatDate(startDateValue);
  const endLabel = formatDate(endDateValue);

  if (startLabel && endLabel) {
    return `Du ${startLabel} au ${endLabel}`;
  }

  if (startLabel) {
    return `A partir du ${startLabel}`;
  }

  if (endLabel) {
    return `Jusqu au ${endLabel}`;
  }

  return "Dates non renseignees";
}

function buildWebGameUrl(
  gameId: string,
  options?: {
    animationId?: string | null;
    merchantId?: string | null;
  },
) {
  const params = new URLSearchParams();

  if (options?.animationId) {
    params.set("animationId", options.animationId);
  }

  if (options?.merchantId) {
    params.set("merchantId", options.merchantId);
  }

  const queryString = params.toString();
  return `${WEB_BASE_URL}/j/${encodeURIComponent(gameId)}${queryString ? `?${queryString}` : ""}`;
}

function buildAndroidIntentUrl(
  gameId: string,
  options?: {
    animationId?: string | null;
    merchantId?: string | null;
  },
) {
  const webGameUrl = buildWebGameUrl(gameId, options);
  const fallbackUrl = encodeURIComponent(PLAY_STORE_URL);
  const webPathWithQuery = webGameUrl.replace(`${WEB_BASE_URL}/`, "");
  return `intent://${webPathWithQuery}#Intent;scheme=https;package=${APP_PACKAGE_NAME};S.browser_fallback_url=${fallbackUrl};end`;
}

async function getPublicGame(gameId: string): Promise<PublicGame | null> {
  const normalizedId = gameId.trim();

  if (!normalizedId || normalizedId.includes("/")) {
    return null;
  }

  const adminDb = getAdminDb();

  for (const collectionName of ["games", "jeux"] as const) {
    const snapshot = await adminDb.collection(collectionName).doc(normalizedId).get();

    if (!snapshot.exists) {
      continue;
    }

    const data = (snapshot.data() as FirestoreGameDocument | undefined) ?? {};

    return {
      id: snapshot.id,
      title: readText(data.title, data.name, "Jeu Proxiplay"),
      description: readText(data.description, data.conditions),
      merchantName: readText(data.merchantName, data.enseigne_name, "Commerce partenaire"),
      imageUrl: readText(data.imageUrl, data.photo, data.coverUrl) || null,
      startDateValue: readMillis(data.start_date, data.startDate),
      endDateValue: readMillis(data.end_date, data.endDate),
      restrictedToAdults: data.prohibited_for_minors === true || data.restrictedToAdults === true,
    };
  }

  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const game = await getPublicGame(gameId);

  return {
    title: game ? `${game.title} | Proxiplay` : "Proxiplay",
    description: game?.description || "Ouvre ce jeu dans l application Proxiplay.",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export const runtime = "nodejs";

export default async function JoinGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ animationId?: string; merchantId?: string }>;
}) {
  const { gameId } = await params;
  const { animationId, merchantId } = await searchParams;
  const game = await getPublicGame(gameId);

  if (!game) {
    notFound();
  }

  const webUrl = buildWebGameUrl(game.id, {
    animationId: animationId?.trim() || null,
    merchantId: merchantId?.trim() || null,
  });
  const androidIntentUrl = buildAndroidIntentUrl(game.id, {
    animationId: animationId?.trim() || null,
    merchantId: merchantId?.trim() || null,
  });
  const dateRangeLabel = buildDateRange(game.startDateValue, game.endDateValue);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_100%)] px-6 py-10 text-slate-950">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <div className="flex flex-col gap-3">
          <span className="w-fit rounded-full bg-indigo-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
            Proxiplay
          </span>
          <h1 className="text-3xl font-bold tracking-tight">{game.title}</h1>
          <p className="text-sm text-slate-600">{game.merchantName}</p>
        </div>

        <OpenAppRedirect androidIntentUrl={androidIntentUrl} />

        <section className="overflow-hidden rounded-[28px] bg-white shadow-lg ring-1 ring-slate-200">
          {game.imageUrl ? (
            // Dynamic merchant images come from Firestore and can use different hosts.
            // A plain img keeps the fallback route independent from Next image domain config.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={game.imageUrl}
              alt={game.title}
              className="h-64 w-full bg-slate-100 object-cover"
            />
          ) : (
            <div className="flex h-64 items-center justify-center bg-slate-100 text-slate-500">
              Visuel du jeu indisponible
            </div>
          )}

          <div className="flex flex-col gap-4 p-6">
            <div className="space-y-2">
              <p className="text-base font-semibold text-slate-900">{dateRangeLabel}</p>
              {game.description ? (
                <p className="text-sm leading-6 text-slate-700">{game.description}</p>
              ) : (
                <p className="text-sm leading-6 text-slate-700">
                  Ouvre ce lien dans l application Proxiplay pour participer et suivre ta
                  progression.
                </p>
              )}
              {game.restrictedToAdults ? (
                <p className="text-sm font-medium text-rose-700">Reserve aux adultes.</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              <a
                href={androidIntentUrl}
                className="rounded-2xl bg-indigo-600 px-5 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
              >
                Ouvrir dans l application
              </a>
              <a
                href={PLAY_STORE_URL}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                Installer Proxiplay
              </a>
            </div>
          </div>
        </section>

        <p className="text-xs leading-5 text-slate-500">
          Lien du jeu:{" "}
          <a href={webUrl} className="underline underline-offset-2">
            {webUrl}
          </a>
        </p>
      </div>
    </main>
  );
}
