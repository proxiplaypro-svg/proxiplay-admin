"use client";

import { FirebaseError } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  type DocumentReference,
  type Timestamp,
} from "firebase/firestore";
import { openGameFacebookPostWindow, openGamePosterPrintWindow } from "@/lib/admin/gamePoster";
import { db, firebaseApp } from "@/lib/firebase/client-app";

type GameDetailsPageProps = {
  params: Promise<{ gameId: string }>;
};

type FirestoreGameDetailsDocument = {
  name?: string;
  title?: string;
  description?: string;
  prize_value?: number;
  start_date?: Timestamp;
  end_date?: Timestamp;
  enseigne_id?: DocumentReference;
  enseigne_name?: string;
  merchantName?: string;
  merchantId?: string;
  animation_id?: string | null;
  campaign_id?: string | null;
  game_type?: string;
  hasMainPrize?: boolean;
  hasWinner?: boolean;
  main_prize_winner?: DocumentReference | null;
  visible_public?: boolean;
  status?: string;
  imageUrl?: string;
  photo?: string;
  views?: number;
  prohibited_for_minors?: boolean;
  restrictedToAdults?: boolean;
  sessionCount?: number;
  partiesCount?: number;
  participations?: number;
  secondary_prizes?: Array<{
    name?: string;
    count?: number;
    presentation?: string;
    description?: string;
  }> | null;
  main_prize_title?: string;
  main_prize_description?: string;
  main_prize_image?: string;
};

type FirestoreParticipantDocument = {
  user_id?: DocumentReference | null;
};

type AdminGameDetails = {
  id: string;
  name: string;
  merchantId: string | null;
  merchantName: string;
  animationId: string | null;
  status: "actif" | "termine" | "brouillon" | "expire" | "prive";
  startDateLabel: string;
  endDateLabel: string;
  startDateValue: number;
  endDateValue: number;
  participationsCount: number;
  uniquePlayersCount: number;
  winnersCount: number;
  viewsCount: number;
  conversionRate: number | null;
  description: string;
  imageUrl: string | null;
  hasMainPrize: boolean;
  mainPrizeValue: number | null;
  mainPrizeTitle: string;
  mainPrizeDescription: string;
  mainPrizeImageUrl: string | null;
  secondaryPrizes: Array<{ name: string; count: number; description: string; presentation?: string }>;
  restrictedToAdults: boolean;
};

type BackfillInstantWinnersPayload = {
  gameId: string;
  dryRun: boolean;
};

type BackfillInstantWinnersResult = {
  success?: boolean;
  created?: number;
  existingInstantWinners?: number;
  error?: string | null;
};

type BackfillFeedback =
  | {
      tone: "success" | "info";
      message: string;
      canConfirm: boolean;
    }
  | {
      tone: "error";
      message: string;
      canConfirm: false;
    };

const functionsClient = getFunctions(firebaseApp, "europe-west1");
const backfillInstantWinnersCallable = httpsCallable<
  BackfillInstantWinnersPayload,
  BackfillInstantWinnersResult
>(functionsClient, "backfillInstantWinnersForGame");

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(Number.isFinite(value) ? value : 0);
}

function getErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") return "Connexion requise.";
    if (error.code === "unavailable") return "Firestore indisponible.";
  }
  return "Impossible de charger ce jeu.";
}

function getBackfillErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "functions/unauthenticated":
        return "Connexion requise pour lancer le backfill.";
      case "functions/permission-denied":
        return "Seuls les admins autorises peuvent lancer le backfill.";
      case "functions/internal":
        return "Le backend a echoue pendant la generation des lots instant winners.";
      case "functions/not-found":
      case "functions/unavailable":
        return "La fonction de backfill n est pas disponible.";
      default:
        return error.message && error.message !== "internal"
          ? error.message
          : "Le backend a retourne une erreur pendant le backfill.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Une erreur inattendue a empeche le backfill.";
}

function deriveStatus(game: FirestoreGameDetailsDocument): AdminGameDetails["status"] {
  const now = Date.now();
  const endMs = game.end_date?.toMillis() ?? null;
  const startMs = game.start_date?.toMillis() ?? null;

  if (game.status === "prive") return "prive";
  if (game.status === "brouillon" || game.visible_public === false) return "brouillon";
  if (endMs !== null && endMs < now) return "expire";
  if (startMs !== null && startMs > now) return "brouillon";
  return "actif";
}

function buildDetails(
  gameId: string,
  game: FirestoreGameDetailsDocument,
  participationsCount: number,
  uniquePlayersCount: number,
  winnersCount: number,
): AdminGameDetails {
  const startDate = game.start_date?.toDate() ?? null;
  const endDate = game.end_date?.toDate() ?? null;
  const imageUrl = game.imageUrl ?? game.photo ?? null;
  const secondaryPrizes = Array.isArray(game.secondary_prizes)
    ? game.secondary_prizes.map((p) => ({
        presentation: p.presentation?.trim() || p.description?.trim() || "",
        name: p.name?.trim() || "Lot sans nom",
        count: typeof p.count === "number" ? p.count : 0,
        description: p.presentation?.trim() || p.description?.trim() || "",
      }))
    : [];

  return {
    id: gameId,
    name: (game.title ?? game.name ?? "").trim() || "Jeu sans titre",
    merchantId: game.enseigne_id?.id ?? game.merchantId ?? null,
    merchantName: (game.merchantName ?? game.enseigne_name ?? "").trim() || "Marchand inconnu",
    animationId: game.animation_id?.trim() || game.campaign_id?.trim() || null,
    status: deriveStatus(game),
    startDateLabel: startDate ? formatDate(startDate) : "—",
    endDateLabel: endDate ? formatDate(endDate) : "—",
    startDateValue: startDate?.getTime() ?? 0,
    endDateValue: endDate?.getTime() ?? 0,
    participationsCount,
    uniquePlayersCount,
    winnersCount,
    viewsCount: typeof game.views === "number" ? game.views : 0,
    conversionRate: participationsCount > 0 ? (winnersCount / participationsCount) * 100 : null,
    description: game.description?.trim() || "",
    imageUrl,
    hasMainPrize: game.hasMainPrize === true,
    mainPrizeValue: typeof game.prize_value === "number" ? game.prize_value : null,
    mainPrizeTitle: game.main_prize_title?.trim() || "",
    mainPrizeDescription: game.main_prize_description?.trim() || "",
    mainPrizeImageUrl: game.main_prize_image?.trim() || null,
    secondaryPrizes,
    restrictedToAdults: game.prohibited_for_minors === true || game.restrictedToAdults === true,
  };
}

const statusConfig: Record<AdminGameDetails["status"], { label: string; className: string }> = {
  actif: { label: "Actif", className: "bg-[#EAF3DE] text-[#3B6D11]" },
  brouillon: { label: "Brouillon", className: "bg-[#FAEEDA] text-[#633806]" },
  termine: { label: "Terminé", className: "bg-[#F1EFE8] text-[#5F5E5A]" },
  expire: { label: "Expiré", className: "bg-[#F1EFE8] text-[#5F5E5A]" },
  prive: { label: "Privé", className: "bg-[#E6F1FB] text-[#185FA5]" },
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[10px] border border-[#E8E8E4] bg-white px-4 py-3">
      <p className="text-[11px] font-medium text-[#999999] uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-[22px] font-semibold text-[#1A1A1A] leading-none">{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-[#999999]">{sub}</p> : null}
    </div>
  );
}

export default function GameDetailsPage({ params }: GameDetailsPageProps) {
  const router = useRouter();
  const [game, setGame] = useState<AdminGameDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState<"dryRun" | "confirm" | null>(null);
  const [backfillFeedback, setBackfillFeedback] = useState<BackfillFeedback | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const { gameId } = await params;
        const gameRef = doc(db, "games", gameId);
        const gameSnap = await getDoc(gameRef);

        if (cancelled) return;

        if (!gameSnap.exists()) {
          setError("Jeu introuvable.");
          setLoading(false);
          return;
        }

        const [participantsCount, participantsDocs, prizesSnap] = await Promise.all([
          getCountFromServer(collection(gameRef, "participants")),
          getDocs(collection(gameRef, "participants")),
          getDocs(collection(db, "prizes")),
        ]);

        if (cancelled) return;

        const uniquePlayersCount = new Set(
          participantsDocs.docs
            .map((d) => (d.data() as FirestoreParticipantDocument).user_id?.id ?? null)
            .filter(Boolean),
        ).size;

        const winnersCount = prizesSnap.docs.filter(
          (d) => d.get("game_id")?.id === gameId,
        ).length;

        setGame(buildDetails(
          gameId,
          gameSnap.data() as FirestoreGameDetailsDocument,
          participantsCount.data().count,
          uniquePlayersCount,
          winnersCount,
        ));
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [params]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-[12px] border border-[#E8E8E4] bg-white" />
        ))}
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="rounded-[12px] border border-[#F09595] bg-[#FCEBEB] px-4 py-4 text-[13px] text-[#A32D2D]">
        {error ?? "Jeu introuvable."}
        <Link href="/admin/games" className="ml-3 underline">← Retour</Link>
      </div>
    );
  }

  const status = statusConfig[game.status];
  const handleDelete = async () => {
    await deleteDoc(doc(db, "games", game.id));
    router.push("/admin/games");
  };

  const handlePrintPoster = async () => {
    const secondaryPrizeSummary =
      game.secondaryPrizes.length > 0
        ? game.secondaryPrizes
            .map((prize) => `${prize.name} (${prize.count})`)
            .join(", ")
        : null;
    const lotDescription =
      game.mainPrizeDescription ||
      game.secondaryPrizes.find((prize) => prize.description)?.description ||
      game.description;

    await openGamePosterPrintWindow({
      id: game.id,
      title: game.name,
      merchantName: game.merchantName,
      description: lotDescription,
      imageUrl: game.imageUrl,
      startDateLabel: game.startDateLabel,
      endDateLabel: game.endDateLabel,
      merchantId: game.merchantId,
      animationId: game.animationId,
      restrictedToAdults: game.restrictedToAdults,
      mainPrizeLabel:
        game.hasMainPrize && game.mainPrizeValue !== null
          ? `${game.mainPrizeValue} EUR`
          : game.hasMainPrize
            ? "Lot principal configure"
            : null,
      secondaryPrizeSummary,
    });
  };

  const handleOpenFacebookPost = async () => {
    const lotDescription =
      game.mainPrizeDescription ||
      game.secondaryPrizes.find((prize) => prize.description)?.description ||
      game.description;

    await openGameFacebookPostWindow({
      id: game.id,
      title: game.name,
      merchantName: game.merchantName,
      description: lotDescription,
      imageUrl: game.imageUrl,
      prizeImageUrl: game.mainPrizeImageUrl ?? game.imageUrl,
      merchantId: game.merchantId,
      animationId: game.animationId,
      restrictedToAdults: game.restrictedToAdults,
      mainPrizeLabel:
        game.hasMainPrize && game.mainPrizeValue !== null
          ? `${game.mainPrizeValue} EUR`
          : game.hasMainPrize
            ? "Lot principal configure"
            : null,
      mainPrizeTitle: game.mainPrizeTitle || null,
    });
  };

  const runBackfillInstantWinners = async (dryRun: boolean) => {
    setBackfillLoading(dryRun ? "dryRun" : "confirm");
    setBackfillFeedback(null);

    try {
      const result = await backfillInstantWinnersCallable({
        gameId: game.id,
        dryRun,
      });
      const created = typeof result.data?.created === "number" ? result.data.created : 0;
      const existingInstantWinners = typeof result.data?.existingInstantWinners === "number"
        ? result.data.existingInstantWinners
        : 0;

      if (existingInstantWinners > 0) {
        setBackfillFeedback({
          tone: "info",
          message: `${formatCount(existingInstantWinners)} instant winners deja presents, rien a faire`,
          canConfirm: false,
        });
        return;
      }

      if (dryRun) {
        setBackfillFeedback({
          tone: "info",
          message: `${formatCount(created)} instant winners seraient crees`,
          canConfirm: created > 0,
        });
        return;
      }

      setBackfillFeedback({
        tone: "success",
        message: `${formatCount(created)} instant winners crees`,
        canConfirm: false,
      });
    } catch (backfillError) {
      setBackfillFeedback({
        tone: "error",
        message: getBackfillErrorMessage(backfillError),
        canConfirm: false,
      });
    } finally {
      setBackfillLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {game.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={game.imageUrl} alt={game.name} className="h-14 w-14 rounded-[10px] object-cover border border-[#E8E8E4]" />
          ) : null}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-semibold text-[#1A1A1A]">{game.name}</h1>
              <span className={`rounded-full px-2 py-1 text-[10.5px] font-medium leading-none ${status.className}`}>
                {status.label}
              </span>
              {game.restrictedToAdults ? (
                <span className="rounded-full bg-[#FCEBEB] px-2 py-1 text-[10.5px] font-medium leading-none text-[#A32D2D]">
                  18+
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[13px] text-[#666666]">{game.merchantName}</p>
            {game.description ? (
              <p className="mt-1 text-[12px] text-[#999999] max-w-[480px]">{game.description}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/games"
            className="rounded-[8px] border border-[#E8E8E4] bg-white px-3 py-2 text-[12px] font-medium text-[#666666] hover:bg-[#F7F7F5]"
          >
            ← Retour
          </Link>
          <Link
            href={`/admin/games/${game.id}/edit`}
            className="rounded-[8px] border border-[#E8E8E4] bg-white px-3 py-2 text-[12px] font-medium text-[#1A1A1A] hover:bg-[#F7F7F5]"
          >
            Modifier
          </Link>
          {!deleteConfirm ? (
            <button
              type="button"
              className="rounded-[8px] border border-[#F09595] bg-white px-3 py-2 text-[12px] font-medium text-[#A32D2D] hover:bg-[#F7F7F5]"
              onClick={() => setDeleteConfirm(true)}
            >
              Supprimer
            </button>
          ) : (
            <>
              <span className="text-[12px] font-medium text-[#A32D2D]">Confirmer ?</span>
              <button
                type="button"
                className="rounded-[8px] border border-[#E24B4A] bg-[#E24B4A] px-3 py-2 text-[12px] font-medium text-white hover:bg-[#cf403f]"
                onClick={() => void handleDelete()}
              >
                Oui
              </button>
              <button
                type="button"
                className="rounded-[8px] border border-[#E8E8E4] bg-white px-3 py-2 text-[12px] font-medium text-[#666666] hover:bg-[#F7F7F5]"
                onClick={() => setDeleteConfirm(false)}
              >
                Annuler
              </button>
            </>
          )}
          {game.merchantId ? (
            <Link
              href={`/admin/commercants/${game.merchantId}`}
              className="rounded-[8px] border border-[#E8E8E4] bg-white px-3 py-2 text-[12px] font-medium text-[#1A1A1A] hover:bg-[#F7F7F5]"
            >
              Voir le marchand
            </Link>
          ) : null}
          <Link
            href={`/admin/winners?gameId=${game.id}`}
            className="rounded-[8px] border border-[#639922] bg-[#639922] px-3 py-2 text-[12px] font-medium text-white hover:bg-[#57881d]"
          >
            Voir les gagnants
          </Link>
          <button
            type="button"
            className="rounded-[8px] border border-[#185FA5] bg-white px-3 py-2 text-[12px] font-medium text-[#185FA5] hover:bg-[#F5FAFE]"
            onClick={() => void handlePrintPoster()}
          >
            Imprimer l affiche
          </button>
          <Link
            href={`/admin/games/${game.id}/visual-generator`}
            className="rounded-[8px] border border-[#639922] bg-white px-3 py-2 text-[12px] font-medium text-[#639922] hover:bg-[#F4FAEC]"
          >
            Generer un visuel IA
          </Link>
          <button
            type="button"
            className="rounded-[8px] border border-[#A0134D] bg-white px-3 py-2 text-[12px] font-medium text-[#A0134D] hover:bg-[#FFF5FA]"
            onClick={() => void handleOpenFacebookPost()}
          >
            Creer le post Facebook
          </button>
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-[10px] border border-[#E8E8E4] bg-white px-4 py-3">
          <p className="text-[11px] text-[#999999]">Date début</p>
          <p className="mt-0.5 text-[14px] font-medium text-[#1A1A1A]">{game.startDateLabel}</p>
        </div>
        <div className="rounded-[10px] border border-[#E8E8E4] bg-white px-4 py-3">
          <p className="text-[11px] text-[#999999]">Date fin</p>
          <p className="mt-0.5 text-[14px] font-medium text-[#1A1A1A]">{game.endDateLabel}</p>
        </div>
        <div className="rounded-[10px] border border-[#E8E8E4] bg-white px-4 py-3">
          <p className="text-[11px] text-[#999999]">Lot principal</p>
          <p className="mt-0.5 text-[14px] font-medium text-[#1A1A1A]">
            {game.hasMainPrize
              ? game.mainPrizeValue !== null
                ? `${game.mainPrizeValue} €`
                : "Oui"
              : "Non"}
          </p>
        </div>
        <div className="rounded-[10px] border border-[#E8E8E4] bg-white px-4 py-3">
          <p className="text-[11px] text-[#999999]">Lots secondaires</p>
          <p className="mt-0.5 text-[14px] font-medium text-[#1A1A1A]">
            {game.secondaryPrizes.length > 0
              ? `${game.secondaryPrizes.length} lot${game.secondaryPrizes.length > 1 ? "s" : ""}`
              : "Aucun"}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div>
        <h2 className="mb-2 text-[13px] font-medium text-[#666666] uppercase tracking-wide">Performance</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Vues" value={formatCount(game.viewsCount)} />
          <StatCard label="Parties" value={formatCount(game.participationsCount)} />
          <StatCard label="Joueurs uniques" value={formatCount(game.uniquePlayersCount)} />
          <StatCard label="Gagnants" value={formatCount(game.winnersCount)} />
          <StatCard
            label="Taux conversion"
            value={game.conversionRate !== null ? `${game.conversionRate.toFixed(1)} %` : "—"}
            sub="gagnants / parties"
          />
        </div>
      </div>

      {/* Lots secondaires */}
      {game.secondaryPrizes.length > 0 ? (
        <div>
          <h2 className="mb-2 text-[13px] font-medium text-[#666666] uppercase tracking-wide">Lots secondaires</h2>
          <div className="flex flex-col gap-2">
            {game.secondaryPrizes.map((prize, i) => (
              <div key={i} className="flex items-center justify-between rounded-[10px] border border-[#E8E8E4] bg-white px-4 py-3">
                <span className="text-[13px] text-[#1A1A1A]">{prize.name}</span>
                <span className="text-[12px] text-[#666666]">{prize.count} disponible{prize.count > 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
          {game.status !== "expire" ? (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-[8px] border border-[#185FA5] bg-white px-3 py-2 text-[12px] font-medium text-[#185FA5] hover:bg-[#F5FAFE] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void runBackfillInstantWinners(true)}
                  disabled={backfillLoading !== null}
                >
                  {backfillLoading === "dryRun" ? "Analyse..." : "Backfill instant winners"}
                </button>
                {backfillFeedback?.canConfirm ? (
                  <button
                    type="button"
                    className="rounded-[8px] border border-[#639922] bg-[#639922] px-3 py-2 text-[12px] font-medium text-white hover:bg-[#57881d] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void runBackfillInstantWinners(false)}
                    disabled={backfillLoading !== null}
                  >
                    {backfillLoading === "confirm" ? "Creation..." : "Confirmer"}
                  </button>
                ) : null}
              </div>
              {backfillFeedback ? (
                <div
                  className={`rounded-[10px] border px-4 py-3 text-[12px] ${
                    backfillFeedback.tone === "error"
                      ? "border-[#F09595] bg-[#FCEBEB] text-[#A32D2D]"
                      : backfillFeedback.tone === "success"
                        ? "border-[#CFE2B3] bg-[#F3F8EA] text-[#3B6D11]"
                        : "border-[#CFE0F3] bg-[#F5FAFE] text-[#185FA5]"
                  }`}
                >
                  {backfillFeedback.message}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

    </div>
  );
}
