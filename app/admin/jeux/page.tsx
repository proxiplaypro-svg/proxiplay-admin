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

export default function AdminJeuxPage() {
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
    )} expirent bientot · ${formatCount(toFix)} a corriger`;
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
      setModalFeedback("Copie creee. Tu peux ajuster les champs avant publication.");
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
      setModalFeedback("Jeu enregistre avec succes.");
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
    <section className="games-manager-page">
      <header className="games-manager-header">
        <div>
          <h1>Jeux &amp; campagnes</h1>
          <p>{summary}</p>
        </div>

        <div className="games-manager-header-actions">
          <button type="button" className="row-link-button secondary" onClick={handleExportCsv}>
            Exporter CSV
          </button>
          <Link className="row-link-button secondary" href="/admin/jeux/nouveau">
            + Nouveau jeu
          </Link>
        </div>
      </header>

      <div className="games-manager-filter-shell">
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
      </div>

      {error ? (
        <div className="dashboard-banner error">
          <strong>Impossible de charger ou modifier les jeux</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="games-manager-list">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="game-manager-card skeleton-card">
              <div className="game-manager-skeleton-block" />
            </div>
          ))}
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="empty-state">
          <strong>Aucun jeu a afficher</strong>
          <p>Les filtres actifs ne retournent aucun document.</p>
        </div>
      ) : (
        <div className="games-manager-list">
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
