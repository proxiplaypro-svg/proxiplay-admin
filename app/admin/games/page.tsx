"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GameCard } from "@/components/admin/jeux/GameCard";
import {
  GameFilters,
  type GamesFilterValue,
  type GamesSortValue,
} from "@/components/admin/jeux/GameFilters";
import { GameEditModal } from "@/components/admin/jeux/GameEditModal";
import { duplicateGame } from "@/lib/firebase/adminActions";
import {
  getGamesAdminData,
  getGamesQueryErrorMessage,
  updateGame,
  updateGameStatus,
} from "@/lib/firebase/gamesQueries";
import type { Game, GameMerchantOption } from "@/types/dashboard";

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

export default function AdminGamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [merchants, setMerchants] = useState<GameMerchantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<GamesFilterValue>("tous");
  const [merchantFilter, setMerchantFilter] = useState("tous");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<GamesSortValue>("end_asc");
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [merchantCollectionName, setMerchantCollectionName] = useState<"enseignes" | "merchants">(
    "enseignes",
  );
  const [togglePendingId, setTogglePendingId] = useState<string | null>(null);
  const [duplicatePendingId, setDuplicatePendingId] = useState<string | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<string | null>(null);
  const [modalFeedbackTone, setModalFeedbackTone] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await getGamesAdminData();

        if (!active) {
          return;
        }

        setGames(data.games);
        setMerchants(data.merchants);
        setMerchantCollectionName(data.merchantCollection);
      } catch (loadError) {
        console.error(loadError);

        if (active) {
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
  }) => {
    if (!selectedGame) {
      return;
    }

    setModalSaving(true);
    setModalFeedback(null);
    setModalFeedbackTone(null);

    try {
      const finalImageUrl = await updateGame({
        gameId: selectedGame.id,
        collectionName: selectedGame.collectionName,
        merchantCollectionName,
        ...payload,
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
        imageUrl: finalImageUrl,
        isPrivate: payload.status === "prive",
        imageMissing: !finalImageUrl,
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

  return (
    <section className="flex flex-col gap-4 bg-[var(--color-background-tertiary,var(--background))] text-[var(--color-text-primary,var(--foreground))]">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Jeux &amp; campagnes</h1>
          <p className="mt-1 text-[13px] text-[var(--color-text-secondary,#7b7b7b)]">{summary}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-[8px] border border-[color:var(--color-border-tertiary,rgba(0,0,0,0.08))] bg-[var(--color-background-primary,#fff)] px-4 py-[10px] text-[12px] font-medium text-[var(--color-text-primary,#171717)] transition hover:bg-[rgba(0,0,0,0.02)]"
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
              className="h-[86px] animate-pulse rounded-[12px] border border-[color:var(--color-border-tertiary,rgba(0,0,0,0.08))] bg-[var(--color-background-primary,#fff)]"
            />
          ))}
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="rounded-[12px] border border-[color:var(--color-border-tertiary,rgba(0,0,0,0.08))] bg-[var(--color-background-primary,#fff)] px-4 py-5 text-[13px] text-[var(--color-text-secondary,#7b7b7b)]">
          Aucun jeu à afficher avec les filtres actuels.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredGames.map((game) => (
            <GameCard
              key={game.id}
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
          ))}
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
      />
    </section>
  );
}
