"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getGameViewsDiagnostics,
  type AdminGameViewsDiagnosticItem,
} from "@/lib/firebase/adminQueries";

type DiagnosticFilter = "all" | "inconsistent" | "post_patch" | "historical" | "consistent";

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function buildDefaultCutoffDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, "0");
  const day = `${today.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseCutoffDate(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDiagnosticBucket(item: AdminGameViewsDiagnosticItem, cutoffValue: number | null) {
  if (item.gapCount <= 0) {
    return "consistent";
  }

  if (cutoffValue === null) {
    return "inconsistent";
  }

  return item.lastParticipationRealValue >= cutoffValue ? "post_patch" : "historical";
}

function getBucketLabel(bucket: ReturnType<typeof getDiagnosticBucket>) {
  switch (bucket) {
    case "post_patch":
      return "Actif apres cutoff";
    case "historical":
      return "Historique";
    case "consistent":
      return "Cohérent";
    default:
      return "Incoherent";
  }
}

export default function AdminTechnicalGamesPage() {
  const [games, setGames] = useState<AdminGameViewsDiagnosticItem[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DiagnosticFilter>("inconsistent");
  const [cutoffDate, setCutoffDate] = useState(buildDefaultCutoffDate);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const items = await getGameViewsDiagnostics();
        if (!isCancelled) {
          setGames(items);
        }
      } catch (fetchError) {
        console.error(fetchError);
        if (!isCancelled) {
          setError("Impossible de charger l audit technique des jeux.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, []);

  const cutoffValue = useMemo(() => parseCutoffDate(cutoffDate)?.getTime() ?? null, [cutoffDate]);

  const filteredGames = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return games.filter((game) => {
      const bucket = getDiagnosticBucket(game, cutoffValue);
      const matchesSearch =
        normalizedSearch.length === 0 ||
        game.name.toLowerCase().includes(normalizedSearch) ||
        game.enseigneName.toLowerCase().includes(normalizedSearch) ||
        game.id.toLowerCase().includes(normalizedSearch);

      const matchesFilter =
        filter === "all" ||
        (filter === "inconsistent" && game.gapCount > 0) ||
        (filter === "post_patch" && bucket === "post_patch") ||
        (filter === "historical" && bucket === "historical") ||
        (filter === "consistent" && bucket === "consistent");

      return matchesSearch && matchesFilter;
    });
  }, [cutoffValue, filter, games, search]);

  const summary = useMemo(() => {
    const inconsistentCount = games.filter((game) => game.gapCount > 0).length;
    const postPatchCount = games.filter(
      (game) => getDiagnosticBucket(game, cutoffValue) === "post_patch",
    ).length;
    const historicalCount = games.filter(
      (game) => getDiagnosticBucket(game, cutoffValue) === "historical",
    ).length;
    const maxGap = games.reduce((max, game) => Math.max(max, game.gapCount), 0);

    return [
      ["Jeux audites", loading ? "..." : formatCount(games.length)],
      ["Jeux incoherents", loading ? "..." : formatCount(inconsistentCount)],
      ["Actifs apres cutoff", loading ? "..." : formatCount(postPatchCount)],
      ["Ecart max", loading ? "..." : formatCount(maxGap)],
      ["Historiques", loading ? "..." : formatCount(historicalCount)],
    ];
  }, [cutoffValue, games, loading]);

  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading technical-panel-heading">
          <div>
            <span className="eyebrow">Vue Technique</span>
            <h2>Jeux Technique</h2>
            <p>
              Audit ponctuel des jeux pour comparer `views` stockees et participations
              reelles de la sous-collection `participants`.
            </p>
          </div>
          <div className="technical-header-actions">
            <Link className="row-link-button secondary" href="/admin/games">
              Vue operations
            </Link>
          </div>
        </div>

        <div className="overview-card technical-cost-note">
          <strong>Objectif</strong>
          <span>
            Mesurer les jeux incoherents, isoler les cas encore actifs apres une date
            de cutoff, puis decider si le comptage client suffit ou si `views` doit
            passer cote backend.
          </span>
        </div>

        <div className="games-toolbar">
          <label className="search-field">
            <span className="search-label">Recherche technique</span>
            <input
              className="search-input"
              type="search"
              placeholder="Jeu, enseigne ou id"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label className="games-filter-field">
            <span className="search-label">Filtre</span>
            <select
              className="games-filter-select"
              value={filter}
              onChange={(event) => setFilter(event.target.value as DiagnosticFilter)}
            >
              <option value="inconsistent">Incoherents</option>
              <option value="post_patch">Actifs apres cutoff</option>
              <option value="historical">Historiques</option>
              <option value="consistent">Coherents</option>
              <option value="all">Tous</option>
            </select>
          </label>

          <label className="games-filter-field">
            <span className="search-label">Cutoff patch</span>
            <input
              className="search-input"
              type="date"
              value={cutoffDate}
              onChange={(event) => setCutoffDate(event.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Resume</h2>
          <p>
            Le cutoff sert a separer les incoherences encore actives des jeux qui
            semblent seulement porter un passif historique.
          </p>
        </div>
        <div className="overview-grid">
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
          <h2>Jeux audites</h2>
          <p>
            Classification basee sur le dernier timestamp reel de participation, pas
            sur la date de creation du jeu.
          </p>
        </div>

        {loading ? (
          <div className="games-loader">
            <div className="loader" aria-hidden="true" />
            <p>Chargement de l audit technique des jeux...</p>
          </div>
        ) : null}

        {!loading && error ? <p className="feedback error">{error}</p> : null}

        {!loading && !error && filteredGames.length === 0 ? (
          <div className="empty-state">
            <strong>Aucun jeu technique a afficher</strong>
            <p>Aucun jeu ne correspond au filtre technique courant.</p>
          </div>
        ) : null}

        {!loading && !error && filteredGames.length > 0 ? (
          <div className="games-admin-table">
            <div className="technical-merchants-header">
              <span>Jeu</span>
              <span>Commercant</span>
              <span>Vues</span>
              <span>Participations</span>
              <span>Ecart</span>
              <span>Derniere participation</span>
              <span>Diagnostic</span>
              <span>Action</span>
            </div>

            <div className="games-table-body">
              {filteredGames.map((game) => {
                const bucket = getDiagnosticBucket(game, cutoffValue);

                return (
                  <article key={game.id} className="technical-merchants-row">
                    <div className="games-cell" data-label="Jeu">
                      <strong>{game.name}</strong>
                      <span>{game.id}</span>
                      <small className="merchant-counter-hint">
                        Debut {game.startDateLabel} | Fin {game.endDateLabel}
                      </small>
                    </div>
                    <div className="games-cell" data-label="Commercant">
                      <strong>{game.enseigneName}</strong>
                      <small className="merchant-counter-hint">
                        Cree {game.createdAtLabel} | Maj {game.updatedAtLabel}
                      </small>
                    </div>
                    <div className="games-cell" data-label="Vues">
                      <strong>{formatCount(game.viewsCount)}</strong>
                      <span>champ `games.views`</span>
                    </div>
                    <div className="games-cell" data-label="Participations">
                      <strong>{formatCount(game.participationsRealCount)}</strong>
                      <span>sous-collection `participants`</span>
                    </div>
                    <div className="games-cell" data-label="Ecart">
                      <strong>{game.gapCount > 0 ? `+${formatCount(game.gapCount)}` : formatCount(game.gapCount)}</strong>
                      <span>{game.gapCount > 0 ? "participations > views" : "coherent"}</span>
                    </div>
                    <div className="games-cell" data-label="Derniere participation">
                      <strong>{game.lastParticipationRealLabel}</strong>
                      <span>{game.status}</span>
                    </div>
                    <div className="games-cell" data-label="Diagnostic">
                      <span className={`technical-state-pill ${
                        bucket === "post_patch"
                          ? "a_resynchroniser"
                          : bucket === "historical"
                            ? "owner_manquant"
                            : "ok"
                      }`}
                      >
                        {getBucketLabel(bucket)}
                      </span>
                      {game.technicalNotes.length > 0 ? (
                        <small className="merchant-counter-hint">
                          {game.technicalNotes.join(" ")}
                        </small>
                      ) : null}
                    </div>
                    <div className="games-cell" data-label="Action">
                      <Link className="row-link-button secondary" href={`/admin/games/${game.id}`}>
                        Voir
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
