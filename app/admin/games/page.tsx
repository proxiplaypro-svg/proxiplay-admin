"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { GameCard } from "@/components/admin/jeux/GameCard";
import {
  GameFilters,
  type GamesFilterValue,
  type GamesSortValue,
} from "@/components/admin/jeux/GameFilters";
import { GameEditModal } from "@/components/admin/jeux/GameEditModal";
import { duplicateGame } from "@/lib/firebase/adminActions";
import { db } from "@/lib/firebase/client-app";
import {
  ensureGamesAuthenticated,
  getGamesQueryErrorMessage,
  updateGame,
  updateGameStatus,
} from "@/lib/firebase/gamesQueries";
import type { Game, GameMerchantOption, GameSecondaryPrize } from "@/types/dashboard";

type GameCollectionName = "games" | "jeux";
type MerchantCollectionName = "enseignes" | "merchants";

type FirestoreGameDocument = {
  title?: string;
  name?: string;
  description?: string;
  conditions?: string;
  merchantId?: string;
  merchant_id?: string;
  enseigne_name?: string;
  merchantName?: string;
  enseigne_id?: DocumentReference | string | null;
  start_date?: Timestamp;
  startDate?: Timestamp;
  end_date?: Timestamp;
  endDate?: Timestamp;
  status?: string;
  imageUrl?: string;
  photo?: string;
  coverUrl?: string;
  visible_public?: boolean;
  isPrivate?: boolean;
  private?: boolean;
  sessionCount?: number | string;
  partiesCount?: number | string;
  participations?: number | string;
  participations_count?: number | string;
  hasMainPrize?: boolean;
  main_prize_title?: string;
  main_prize_description?: string;
  prize_value?: number | string | null;
  main_prize_image?: string;
  secondary_prizes?: Array<{
    name?: string;
    description?: string;
    count?: number | string;
    image?: string;
  }> | null;
  restrictedToAdults?: boolean;
};

type FirestoreMerchantDocument = {
  name?: string;
  title?: string;
  merchantName?: string;
};

function readText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function readNullableText(...values: Array<string | null | undefined>) {
  const value = readText(...values);
  return value.length > 0 ? value : null;
}

function readNumber(...values: Array<number | string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value);
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number.parseInt(value, 10);

      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function readOptionalNumber(...values: Array<number | string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number.parseFloat(value);

      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function readTimestamp(...values: Array<Timestamp | null | undefined>) {
  return values.find((value) => value instanceof Timestamp) ?? null;
}

function buildSecondaryPrizeId(index: number) {
  return `secondary-prize-${index + 1}`;
}

function mapSecondaryPrize(
  prize: NonNullable<FirestoreGameDocument["secondary_prizes"]>[number],
  index: number,
): GameSecondaryPrize {
  return {
    id: buildSecondaryPrizeId(index),
    name: readText(prize?.name),
    description: readText(prize?.description),
    count:
      prize?.count === undefined || prize.count === null
        ? ""
        : typeof prize.count === "number"
          ? String(Math.trunc(prize.count))
          : prize.count.trim(),
    image: readNullableText(prize?.image),
  };
}

function readMerchantId(value: FirestoreGameDocument["enseigne_id"], fallback?: string | null) {
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return fallback.trim();
  }

  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value.trim() || null;
  }

  return value.id ?? null;
}

function normalizeStatus(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();

  switch (normalized) {
    case "active":
    case "actif":
    case "public":
      return "actif" as const;
    case "expired":
    case "expire":
    case "expiré":
    case "termine":
    case "terminé":
      return "expire" as const;
    case "draft":
    case "brouillon":
    case "inactive":
    case "inactif":
      return "brouillon" as const;
    case "private":
    case "prive":
    case "privé":
      return "prive" as const;
    default:
      return null;
  }
}

function deriveStatus(game: FirestoreGameDocument, now = Date.now()) {
  const explicitStatus = normalizeStatus(game.status);
  const isPrivate = game.isPrivate === true || game.private === true;
  const isPublic = game.visible_public !== false;
  const endTimestamp = readTimestamp(game.end_date, game.endDate);
  const endValue = endTimestamp?.toMillis() ?? null;
  const startTimestamp = readTimestamp(game.start_date, game.startDate);
  const startValue = startTimestamp?.toMillis() ?? null;

  if (explicitStatus) {
    return explicitStatus;
  }

  if (isPrivate) {
    return "prive" as const;
  }

  if (endValue !== null && endValue < now) {
    return "expire" as const;
  }

  if (!isPublic) {
    return "brouillon" as const;
  }

  if (startValue !== null && startValue > now) {
    return "brouillon" as const;
  }

  return "actif" as const;
}

function mapMerchantOption(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  collectionName: MerchantCollectionName,
): GameMerchantOption {
  const merchant = snapshot.data() as FirestoreMerchantDocument;

  return {
    id: snapshot.id,
    name: readText(merchant.name, merchant.title, merchant.merchantName, "Marchand sans nom"),
    collectionName,
  };
}

async function tryReadMerchantCollection(collectionName: MerchantCollectionName) {
  const snapshot = await getDocs(query(collection(db, collectionName), limit(100)));

  return snapshot.docs
    .map((entry) => mapMerchantOption(entry, collectionName))
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));
}

async function loadMerchantOptions() {
  const candidates: MerchantCollectionName[] = ["enseignes", "merchants"];

  for (const candidate of candidates) {
    try {
      const merchantOptions = await tryReadMerchantCollection(candidate);
      return {
        merchantCollectionName: candidate,
        merchantOptions,
      };
    } catch {
      continue;
    }
  }

  return {
    merchantCollectionName: "enseignes" as MerchantCollectionName,
    merchantOptions: [] as GameMerchantOption[],
  };
}

function mapGameDocument(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  collectionName: GameCollectionName,
  merchantsById: Map<string, GameMerchantOption>,
): Game {
  const game = snapshot.data() as FirestoreGameDocument;
  const title = readText(game.title, game.name, "Jeu sans titre");
  const description = readText(game.description, game.conditions);
  const merchantId = readMerchantId(game.enseigne_id, game.merchantId ?? game.merchant_id ?? null);
  const merchantName =
    readNullableText(
      game.merchantName,
      game.enseigne_name,
      merchantId ? merchantsById.get(merchantId)?.name : null,
    ) ?? "Marchand inconnu";
  const startTimestamp = readTimestamp(game.start_date, game.startDate);
  const endTimestamp = readTimestamp(game.end_date, game.endDate);
  const imageUrl = readNullableText(game.imageUrl, game.photo, game.coverUrl);
  const status = deriveStatus(game);
  const mainPrizeValue = readOptionalNumber(game.prize_value);
  const secondaryPrizes = Array.isArray(game.secondary_prizes)
    ? game.secondary_prizes.map((prize, index) => mapSecondaryPrize(prize, index))
    : [];

  return {
    id: snapshot.id,
    title,
    description,
    merchantId,
    merchantName,
    startDate: startTimestamp ? startTimestamp.toDate().toISOString() : null,
    endDate: endTimestamp ? endTimestamp.toDate().toISOString() : null,
    startDateValue: startTimestamp?.toMillis() ?? null,
    endDateValue: endTimestamp?.toMillis() ?? null,
    status,
    imageUrl,
    isPrivate: status === "prive",
    sessionCount: readNumber(
      game.sessionCount,
      game.partiesCount,
      game.participations,
      game.participations_count,
    ),
    collectionName,
    imageMissing: !imageUrl,
    hasMainPrize: game.hasMainPrize === true,
    mainPrizeTitle: readText(game.main_prize_title),
    mainPrizeDescription: readText(game.main_prize_description),
    mainPrizeValue: mainPrizeValue === null ? "" : String(mainPrizeValue),
    mainPrizeImage: readNullableText(game.main_prize_image),
    secondaryPrizes,
    restrictedToAdults: game.restrictedToAdults === true,
  };
}

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function buildCsv(games: Game[]) {
  const lines = [
    ["Titre", "Marchand", "Statut", "Date debut", "Date fin", "Parties"].join(";"),
    ...games.map((game) =>
      [
        `"${game.title.replaceAll('"', '""')}"`,
        `"${game.merchantName.replaceAll('"', '""')}"`,
        game.status,
        game.startDate ?? "",
        game.endDate ?? "",
        String(game.sessionCount),
      ].join(";"),
    ),
  ];

  return lines.join("\n");
}

function AdminGamesPageInner() {
  const searchParams = useSearchParams();
  const [games, setGames] = useState<Game[]>([]);
  const [merchants, setMerchants] = useState<GameMerchantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<GamesFilterValue>("tous");
  const [merchantFilter, setMerchantFilter] = useState(() => searchParams.get("merchantId") ?? "tous");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<GamesSortValue>("created_desc");
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [merchantCollectionName, setMerchantCollectionName] = useState<"enseignes" | "merchants">(
    "enseignes",
  );
  const [togglePendingId, setTogglePendingId] = useState<string | null>(null);
  const [duplicatePendingId, setDuplicatePendingId] = useState<string | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<string | null>(null);
  const [modalFeedbackTone, setModalFeedbackTone] = useState<"success" | "error" | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const gameCollectionRef = useRef<GameCollectionName>("games");

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        await ensureGamesAuthenticated();

        const fetchGames = async () => {
          const gamesSnapshot = await getDocs(
            query(collection(db, "games"), orderBy("end_date", "desc"), limit(30)),
          );
          const gameCollection: GameCollectionName = gamesSnapshot.empty ? "jeux" : "games";
          const finalSnapshot = gamesSnapshot.empty
            ? await getDocs(query(collection(db, "jeux"), orderBy("end_date", "desc"), limit(30)))
            : gamesSnapshot;

          return { gameCollection, finalSnapshot };
        };

        const [
          { gameCollection, finalSnapshot },
          { merchantCollectionName: resolvedMerchantCollectionName, merchantOptions },
        ] = await Promise.all([fetchGames(), loadMerchantOptions()]);
        const merchantsById = new Map(merchantOptions.map((merchant) => [merchant.id, merchant]));
        const gameItems = finalSnapshot.docs
          .map((snapshot) => mapGameDocument(snapshot, gameCollection, merchantsById))
          .sort((left, right) => (right.startDateValue ?? 0) - (left.startDateValue ?? 0));

        if (!active) {
          return;
        }

        gameCollectionRef.current = gameCollection;
        lastDocRef.current = finalSnapshot.docs[finalSnapshot.docs.length - 1] ?? null;
        setHasMore(finalSnapshot.docs.length === 30);
        setGames(gameItems);
        setMerchants(merchantOptions);
        setMerchantCollectionName(resolvedMerchantCollectionName);
      } catch (loadError) {
        console.error(loadError);

        if (active) {
          setHasMore(false);
          setError(getGamesQueryErrorMessage(loadError));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const filteredGames = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const result = games.filter((game) => {
      const matchesStatus = statusFilter === "tous" || game.status === statusFilter;
      const matchesMerchant = merchantFilter === "tous" || game.merchantId === merchantFilter;
      const matchesSearch =
        normalizedSearch.length === 0 || game.title.toLowerCase().includes(normalizedSearch);

      return matchesStatus && matchesMerchant && matchesSearch;
    });

    return result.sort((left, right) => {
      if (sort === "sessions_desc") {
        return right.sessionCount - left.sessionCount;
      }

      if (sort === "created_desc") {
        return (right.startDateValue ?? 0) - (left.startDateValue ?? 0);
      }

      const leftEnd = left.endDateValue ?? 0;
      const rightEnd = right.endDateValue ?? 0;

      return sort === "end_desc" ? rightEnd - leftEnd : leftEnd - rightEnd;
    });
  }, [games, merchantFilter, search, sort, statusFilter]);

  const summary = useMemo(() => {
    const total = games.length;
    const active = games.filter((game) => game.status === "actif").length;
    const expiringSoon = games.filter((game) => {
      if (game.status !== "actif" || !game.endDateValue) {
        return false;
      }

      const remaining = game.endDateValue - Date.now();
      return remaining > 0 && remaining <= 7 * 24 * 60 * 60 * 1000;
    }).length;
    const toFix = games.filter((game) => game.imageMissing).length;

    return `${formatCount(total)} jeux au total · ${formatCount(active)} actifs · ${formatCount(
      expiringSoon,
    )} expirent bientôt · ${formatCount(toFix)} à corriger`;
  }, [games]);

  const handleExportCsv = () => {
    const blob = new Blob([buildCsv(filteredGames)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "proxiplay-jeux.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleToggle = async (game: Game) => {
    const previousStatus = game.status;
    const nextStatus = game.status === "actif" || game.status === "prive" ? "brouillon" : "actif";

    setTogglePendingId(game.id);
    setGames((current) =>
      current.map((item) => (item.id === game.id ? { ...item, status: nextStatus } : item)),
    );

    try {
      await updateGameStatus({
        gameId: game.id,
        collectionName: game.collectionName,
        status: nextStatus,
      });
    } catch (toggleError) {
      console.error(toggleError);
      setGames((current) =>
        current.map((item) => (item.id === game.id ? { ...item, status: previousStatus } : item)),
      );
      setError(getGamesQueryErrorMessage(toggleError));
    } finally {
      setTogglePendingId(null);
    }
  };

  const handleDuplicate = async (game: Game) => {
    setDuplicatePendingId(game.id);
    setError(null);

    try {
      const result = await duplicateGame({
        gameId: game.id,
        collectionName: game.collectionName,
        merchantCollectionName,
      });

      setGames((current) => [result.game, ...current]);
      setSelectedGame(result.game);
      setModalFeedback("Copie créée. Tu peux ajuster les champs avant publication.");
      setModalFeedbackTone("success");
    } catch (duplicateError) {
      console.error(duplicateError);
      setError(getGamesQueryErrorMessage(duplicateError));
    } finally {
      setDuplicatePendingId(null);
    }
  };

  const handleSave = async (payload: {
    title: string;
    description: string;
    merchantId: string | null;
    merchantName: string;
    startDate: string | null;
    endDate: string | null;
    status: Game["status"];
    imageUrl: string | null;
    imageFile: File | null;
    hasMainPrize: boolean;
    mainPrizeTitle: string;
    mainPrizeDescription: string;
    mainPrizeValue: string;
    mainPrizeImage: string | null;
    mainPrizeImageFile: File | null;
    secondaryPrizes: GameSecondaryPrize[];
    restrictedToAdults: boolean;
  }) => {
    if (!selectedGame) {
      return;
    }

    setModalSaving(true);
    setModalFeedback(null);
    setModalFeedbackTone(null);

    try {
      const result = await updateGame({
        gameId: selectedGame.id,
        collectionName: selectedGame.collectionName,
        merchantCollectionName,
        ...payload,
        restrictedToAdults: payload.restrictedToAdults,
      });

      const updatedGame: Game = {
        ...selectedGame,
        title: payload.title,
        description: payload.description,
        merchantId: payload.merchantId,
        merchantName: payload.merchantName,
        startDate: payload.startDate,
        endDate: payload.endDate,
        startDateValue: payload.startDate ? new Date(payload.startDate).getTime() : null,
        endDateValue: payload.endDate ? new Date(payload.endDate).getTime() : null,
        status: payload.status,
        imageUrl: result.imageUrl,
        isPrivate: payload.status === "prive",
        imageMissing: !result.imageUrl,
        hasMainPrize: payload.hasMainPrize,
        mainPrizeTitle: payload.mainPrizeTitle,
        mainPrizeDescription: payload.mainPrizeDescription,
        mainPrizeValue: payload.mainPrizeValue,
        mainPrizeImage: result.mainPrizeImage,
        secondaryPrizes: result.secondaryPrizes,
        restrictedToAdults: payload.restrictedToAdults,
      };

      setGames((current) =>
        current.map((game) => (game.id === updatedGame.id ? updatedGame : game)),
      );
      setSelectedGame(updatedGame);
      setModalFeedback("Jeu enregistré avec succès.");
      setModalFeedbackTone("success");
    } catch (saveError) {
      console.error(saveError);
      setModalFeedback(getGamesQueryErrorMessage(saveError));
      setModalFeedbackTone("error");
    } finally {
      setModalSaving(false);
    }
  };

  const handleDelete = async (game: Game) => {
    try {
      await deleteDoc(doc(db, game.collectionName, game.id));
      setGames((current) => current.filter((item) => item.id !== game.id));
      setSelectedGame(null);
    } catch (deleteError) {
      console.error(deleteError);
      setError(getGamesQueryErrorMessage(deleteError));
    }
  };

  const handleLoadMore = async () => {
    if (!lastDocRef.current || loadingMore) return;

    setLoadingMore(true);

    try {
      const moreQuery = query(
        collection(db, gameCollectionRef.current),
        orderBy("end_date", "desc"),
        startAfter(lastDocRef.current),
        limit(30),
      );
      const moreSnapshot = await getDocs(moreQuery);
      lastDocRef.current = moreSnapshot.docs[moreSnapshot.docs.length - 1] ?? null;
      setHasMore(moreSnapshot.docs.length === 30);
      const merchantsById = new Map(merchants.map((merchant) => [merchant.id, merchant]));
      const moreGames = moreSnapshot.docs.map((snapshot) =>
        mapGameDocument(snapshot, gameCollectionRef.current, merchantsById),
      );
      setGames((current) => [...current, ...moreGames]);
    } catch (loadMoreError) {
      console.error(loadMoreError);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 bg-[#F7F7F5] text-[#1A1A1A]">
      <header className="flex flex-col gap-3 bg-[#F7F7F5] lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#1A1A1A]">Jeux &amp; campagnes</h1>
          <p className="mt-1 text-[13px] text-[#666666]">{summary}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-[8px] border border-[#E0E0DA] bg-white px-4 py-[10px] text-[12px] font-medium text-[#1A1A1A] transition hover:bg-[#FAFAF8]"
            onClick={handleExportCsv}
          >
            Exporter CSV
          </button>
          <Link
            className="rounded-[8px] border border-[#639922] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white transition hover:bg-[#57881d]"
            href="/admin/games/new"
          >
            + Nouveau jeu
          </Link>
        </div>
      </header>

      <GameFilters
        status={statusFilter}
        merchantId={merchantFilter}
        search={search}
        sort={sort}
        merchants={merchants}
        onStatusChange={setStatusFilter}
        onMerchantChange={setMerchantFilter}
        onSearchChange={setSearch}
        onSortChange={setSort}
      />

      {error ? (
        <div className="rounded-[12px] border border-[#F09595] bg-[#FCEBEB] px-4 py-3 text-[12px] text-[#A32D2D]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-[86px] animate-pulse rounded-[12px] border border-[#E8E8E4] bg-white"
            />
          ))}
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="rounded-[12px] border border-[#E8E8E4] bg-white px-4 py-5 text-[13px] text-[#666666]">
          Aucun jeu à afficher avec les filtres actuels.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredGames.map((game) => (
            <div
              key={game.id}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedGame(game);
                setModalFeedback(null);
                setModalFeedbackTone(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedGame(game);
                  setModalFeedback(null);
                  setModalFeedbackTone(null);
                }
              }}
            >
              <GameCard
                game={game}
                isTogglePending={togglePendingId === game.id}
                isDuplicatePending={duplicatePendingId === game.id}
                onToggle={handleToggle}
                onEdit={(item) => {
                  setSelectedGame(item);
                  setModalFeedback(null);
                  setModalFeedbackTone(null);
                }}
                onDuplicate={handleDuplicate}
              />
            </div>
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={() => void handleLoadMore()}
              disabled={loadingMore}
              className="w-full rounded-[10px] border border-[#E8E8E4] bg-white px-4 py-3 text-[12px] text-[#666666] transition hover:bg-[#F7F7F5] disabled:opacity-50"
            >
              {loadingMore ? "Chargement..." : "Charger plus de jeux"}
            </button>
          )}
        </div>
      )}

      <GameEditModal
        game={selectedGame}
        merchants={merchants}
        open={selectedGame !== null}
        saving={modalSaving}
        feedback={modalFeedback}
        feedbackTone={modalFeedbackTone}
        onClose={() => {
          if (!modalSaving) {
            setSelectedGame(null);
            setModalFeedback(null);
            setModalFeedbackTone(null);
          }
        }}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </section>
  );
}

export default function AdminGamesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-[13px] text-[#666]">Chargement...</div>}>
      <AdminGamesPageInner />
    </Suspense>
  );
}
