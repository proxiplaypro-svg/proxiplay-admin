"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getGamesList, type AdminGameListItem } from "@/lib/firebase/adminQueries";

type StatusFilter = "tous" | "actif" | "a_venir" | "termine";

type GameRow = AdminGameListItem & {
  isProblem: boolean;
  isExpiredActive: boolean;
  sortPriority: number;
};

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatWinnerRate(winnersCount: number, participationsCount: number) {
  if (participationsCount <= 0) {
    return "N/A";
  }

  return `${((winnersCount / participationsCount) * 100).toFixed(1)} %`;
}

function getStatusLabel(status: AdminGameListItem["status"]) {
  switch (status) {
    case "actif":
      return "Actif";
    case "a_venir":
      return "A venir";
    default:
      return "Termine";
  }
}

export default function AdminGamesPage() {
  const router = useRouter();
  const [games, setGames] = useState<AdminGameListItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("tous");
  const [merchantFilter, setMerchantFilter] = useState("tous");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const fetchGames = async () => {
      setLoading(true);
      setError(null);

      try {
        const items = await getGamesList();

        if (!isCancelled) {
          setGames(items);
        }
      } catch (fetchError) {
        console.error(fetchError);
        if (!isCancelled) {
          setError("Impossible de charger la liste des jeux depuis Firestore.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void fetchGames();

    return () => {
      isCancelled = true;
    };
  }, []);

  const merchantOptions = useMemo(
    () =>
      Array.from(new Set(games.map((game) => game.enseigneName)))
        .sort((a, b) => a.localeCompare(b, "fr")),
    [games],
  );

  const preparedGames = useMemo<GameRow[]>(() => {
    const now = Date.now();

    return games
      .map((game) => {
        const isExpiredActive = game.status === "actif" && game.endDateValue < now;
        const isProblem = game.participationsCount === 0 || game.status === "termine" || isExpiredActive;
        const sortPriority = game.status === "actif" ? 0 : game.status === "a_venir" ? 1 : 2;

        return {
          ...game,
          isExpiredActive,
          isProblem,
          sortPriority,
        };
      })
      .sort((a, b) => {
        if (a.sortPriority !== b.sortPriority) {
          return a.sortPriority - b.sortPriority;
        }

        return b.startDateValue - a.startDateValue;
      });
  }, [games]);

  const filteredGames = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return preparedGames.filter((game) => {
      const matchesSearch =
        normalizedSearch.length === 0 || game.name.toLowerCase().includes(normalizedSearch);

      const matchesStatus = statusFilter === "tous" || game.status === statusFilter;
      const matchesMerchant =
        merchantFilter === "tous" || game.enseigneName === merchantFilter;

      return matchesSearch && matchesStatus && matchesMerchant;
    });
  }, [merchantFilter, preparedGames, search, statusFilter]);

  const summary = useMemo(() => {
    const total = games.length;
    const active = games.filter((game) => game.status === "actif").length;
    const ended = games.filter((game) => game.status === "termine").length;
    const problematic = preparedGames.filter((game) => game.isProblem).length;

    return [
      ["Jeux totaux", loading ? "..." : formatCount(total)],
      ["Jeux actifs", loading ? "..." : formatCount(active)],
      ["Jeux termines", loading ? "..." : formatCount(ended)],
      ["Jeux a surveiller", loading ? "..." : formatCount(problematic)],
    ];
  }, [games, loading, preparedGames]);

  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Jeux</h2>
          <p>Dashboard operations pour suivre rapidement les campagnes, les signaux faibles et les actions utiles.</p>
        </div>

        <div className="games-ops-toolbar">
          <label className="search-field">
            <span className="search-label">Recherche par nom</span>
            <input
              className="search-input"
              type="search"
              placeholder="Rechercher un jeu"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label className="games-filter-field">
            <span className="search-label">Statut</span>
            <select
              className="games-filter-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="tous">Tous</option>
              <option value="actif">Actifs</option>
              <option value="a_venir">A venir</option>
              <option value="termine">Termines</option>
            </select>
          </label>

          <label className="games-filter-field">
            <span className="search-label">Commercant</span>
            <select
              className="games-filter-select"
              value={merchantFilter}
              onChange={(event) => setMerchantFilter(event.target.value)}
            >
              <option value="tous">Toutes les enseignes</option>
              {merchantOptions.map((merchant) => (
                <option key={merchant} value={merchant}>
                  {merchant}
                </option>
              ))}
            </select>
          </label>

          <Link className="primary-button games-create-button" href="/admin/games/new">
            Create game
          </Link>
        </div>
      </div>

      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Resume</h2>
          <p>Les volumes essentiels pour voir ce qui tourne, ce qui est termine et ce qui merite une action.</p>
        </div>
        <div className="overview-grid games-summary-grid">
          {summary.map(([label, value]) => (
            <article key={label} className="overview-card">
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
      </div>

      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Tableau principal</h2>
          <p>Tri prioritaire sur les jeux actifs, puis sur les dates de debut les plus recentes.</p>
        </div>

        {loading ? (
          <div className="games-loader">
            <div className="loader" aria-hidden="true" />
            <p>Chargement du dashboard operations...</p>
          </div>
        ) : null}

        {!loading && error ? (
          <div className="dashboard-banner error games-state-banner">
            <strong>Impossible de charger les jeux.</strong>
            <p>{error}</p>
          </div>
        ) : null}

        {!loading && !error && filteredGames.length === 0 ? (
          <div className="empty-state">
            <strong>Aucun jeu a afficher</strong>
            <p>Aucun document `games` ne correspond aux filtres actifs.</p>
          </div>
        ) : null}

        {!loading && !error && filteredGames.length > 0 ? (
          <div className="games-admin-table">
            <div className="games-table-header games-ops-table-header">
              <span>Jeu</span>
              <span>Commercant</span>
              <span>Statut</span>
              <span>Participations</span>
              <span>Gagnants</span>
              <span>Fin</span>
              <span>Actions</span>
            </div>

            <div className="games-table-body">
              {filteredGames.map((game) => (
                <article
                  key={game.id}
                  className={`games-table-row games-ops-row ${game.isProblem ? "problem" : ""} ${
                    game.isExpiredActive ? "expired-active" : ""
                  }`}
                  onClick={() => router.push(`/admin/games/${game.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/admin/games/${game.id}`);
                    }
                  }}
                  role="link"
                  tabIndex={0}
                >
                  <div className="games-cell" data-label="Jeu">
                    <strong>{game.name}</strong>
                    <div className="game-inline-flags">
                      {game.participationsCount === 0 ? (
                        <span className="game-flag">0 participation</span>
                      ) : null}
                      {game.isExpiredActive ? (
                        <span className="game-flag alert">Actif mais expire</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="games-cell" data-label="Commercant">
                    <span>{game.enseigneName}</span>
                  </div>
                  <div className="games-cell" data-label="Statut">
                    <span className={`game-badge ${game.isProblem ? "problem" : game.status}`}>
                      {game.isProblem ? "Probleme" : getStatusLabel(game.status)}
                    </span>
                  </div>
                  <div className="games-cell" data-label="Participations">
                    <strong>{formatCount(game.participationsCount)}</strong>
                  </div>
                  <div className="games-cell" data-label="Gagnants">
                    <strong>{formatCount(game.winnersCount)}</strong>
                    {game.status === "termine" ? (
                      <small className="games-cell-helper">
                        {formatWinnerRate(game.winnersCount, game.participationsCount)} des participations
                      </small>
                    ) : null}
                  </div>
                  <div className="games-cell" data-label="Date fin">
                    <span>{game.endDateLabel}</span>
                  </div>
                  <div className="games-cell" data-label="Actions">
                    <div className="games-row-actions">
                      <Link
                        className="row-link-button"
                        href={`/admin/games/${game.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        Voir
                      </Link>
                      <Link
                        className="row-link-button secondary"
                        href={`/admin/games/${game.id}/edit`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        Editer
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
