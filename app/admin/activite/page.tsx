"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getMerchantsList,
  getPlayersList,
  type AdminMerchantListItem,
  type AdminPlayerListItem,
} from "@/lib/firebase/adminQueries";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function isWithinDays(timestamp: number, days: number) {
  return timestamp > 0 && Date.now() - timestamp <= days * DAY_IN_MS;
}

function getPlayerLabel(player: AdminPlayerListItem) {
  if (player.fullName !== "Non renseigne") {
    return player.fullName;
  }

  if (player.pseudo !== "Non renseigne") {
    return player.pseudo;
  }

  return player.email;
}

export default function AdminActivityPage() {
  const [players, setPlayers] = useState<AdminPlayerListItem[]>([]);
  const [merchants, setMerchants] = useState<AdminMerchantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadActivity = async () => {
      setLoading(true);
      setError(null);

      try {
        const [playerItems, merchantItems] = await Promise.all([
          getPlayersList(),
          getMerchantsList(),
        ]);

        if (!isCancelled) {
          setPlayers(playerItems);
          setMerchants(merchantItems);
        }
      } catch (loadError) {
        console.error(loadError);

        if (!isCancelled) {
          setError("Impossible de charger les indicateurs d activite depuis Firestore.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadActivity();

    return () => {
      isCancelled = true;
    };
  }, []);

  const playerMetrics = useMemo(() => {
    const counts = {
      active7Days: 0,
      active30Days: 0,
      new30Days: 0,
      toRelaunch: 0,
      inactive: 0,
      neverActive: 0,
      veryActive: 0,
      active: 0,
    };

    players.forEach((player) => {
      if (isWithinDays(player.lastRealActivityValue, 7)) {
        counts.active7Days += 1;
      }

      if (isWithinDays(player.lastRealActivityValue, 30)) {
        counts.active30Days += 1;
      }

      if (isWithinDays(player.createdAtValue, 30)) {
        counts.new30Days += 1;
      }

      if (player.assiduityLabel === "Tres actif") {
        counts.veryActive += 1;
      }

      if (player.assiduityLabel === "Actif") {
        counts.active += 1;
      }

      if (player.assiduityLabel === "A relancer") {
        counts.toRelaunch += 1;
      }

      if (player.assiduityLabel === "Jamais actif") {
        counts.neverActive += 1;
        counts.inactive += 1;
      }

      if (player.assiduityLabel === "Inactif") {
        counts.inactive += 1;
      }
    });

    return counts;
  }, [players]);

  const merchantMetrics = useMemo(() => {
    const counts = {
      registered: merchants.length,
      withGames: 0,
      withoutGames: 0,
      withParticipation: 0,
      withoutFirstParticipation: 0,
      recentlyLaunched: 0,
    };

    merchants.forEach((merchant) => {
      if (merchant.gamesCreatedCount > 0) {
        counts.withGames += 1;
      } else {
        counts.withoutGames += 1;
      }

      if (merchant.participationsCount > 0) {
        counts.withParticipation += 1;
      }

      if (merchant.gamesCreatedCount > 0 && merchant.participationsCount === 0) {
        counts.withoutFirstParticipation += 1;
      }

      if (isWithinDays(merchant.latestGameStartValue, 30)) {
        counts.recentlyLaunched += 1;
      }
    });

    return counts;
  }, [merchants]);

  const usefulSegments = useMemo(() => {
    const inactivePlayers = players
      .filter((player) => player.assiduityLabel === "Inactif" || player.assiduityLabel === "Jamais actif")
      .slice(0, 3);
    const merchantsWithoutParticipation = merchants
      .filter((merchant) => merchant.gamesCreatedCount > 0 && merchant.participationsCount === 0)
      .slice(0, 3);

    return {
      inactivePlayers,
      merchantsWithoutParticipation,
    };
  }, [merchants, players]);

  return (
    <section className="content-grid" id="menu-activite">
      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Activite</h2>
          <p>
            Vue de pilotage simple pour suivre l activite recente, la retention cote joueurs et
            l activation cote commercants avec les donnees deja exploitees dans l admin.
          </p>
        </div>

        <nav className="rankings-nav" aria-label="Sections activite">
          <a className="filter-chip" href="#activite-kpi">
            KPI
          </a>
          <a className="filter-chip" href="#activite-joueurs">
            Joueurs
          </a>
          <a className="filter-chip" href="#activite-commercants">
            Commercants
          </a>
          <a className="filter-chip" href="#activite-segments">
            Segments utiles
          </a>
        </nav>

        {loading ? <p className="feedback neutral">Chargement des indicateurs d activite...</p> : null}
        {error ? <p className="feedback error">{error}</p> : null}
      </div>

      {!loading && !error ? (
        <>
          <div className="panel panel-wide" id="activite-kpi">
            <div className="panel-heading">
              <h2>KPI</h2>
              <p>Les indicateurs les plus utiles pour suivre activite recente et activation.</p>
              <a className="secondary-button" href="#menu-activite">Retour au menu</a>
            </div>

            <div className="overview-grid">
              <article className="overview-card">
                <span>Joueurs actifs 7 jours</span>
                <strong>{formatCount(playerMetrics.active7Days)}</strong>
                <p>Base sur `last_real_activity_at` sur 7 jours glissants.</p>
              </article>
              <article className="overview-card">
                <span>Joueurs actifs 30 jours</span>
                <strong>{formatCount(playerMetrics.active30Days)}</strong>
                <p>Permet de lire rapidement la base encore vraiment active.</p>
              </article>
              <article className="overview-card">
                <span>Nouveaux joueurs 30 jours</span>
                <strong>{formatCount(playerMetrics.new30Days)}</strong>
                <p>Base sur `created_time` et utile pour suivre l acquisition recente.</p>
              </article>
              <article className="overview-card">
                <span>Joueurs inactifs</span>
                <strong>{formatCount(playerMetrics.inactive)}</strong>
                <p>Somme des segments `Inactif` et `Jamais actif`.</p>
              </article>
              <article className="overview-card">
                <span>Commercants avec au moins un jeu</span>
                <strong>{formatCount(merchantMetrics.withGames)}</strong>
                <p>Etape d activation mesuree via les jeux lies au owner de l enseigne.</p>
              </article>
              <article className="overview-card">
                <span>Commercants avec participation</span>
                <strong>{formatCount(merchantMetrics.withParticipation)}</strong>
                <p>Permet de voir combien depassent la simple creation du jeu.</p>
              </article>
            </div>

            <div className="rankings-section-links">
              <a className="secondary-button" href="#menu-activite">Retour au menu</a>
              <a className="secondary-button" href="#menu-activite">Retour en haut</a>
            </div>
          </div>

          <div className="panel panel-wide" id="activite-joueurs">
            <div className="panel-heading">
              <h2>Activite joueurs</h2>
              <p>{formatCount(players.length)} joueur(s) exploites depuis `users` et `prizes`.</p>
              <a className="secondary-button" href="#menu-activite">Retour au menu</a>
            </div>

            <div className="overview-grid">
              <article className="overview-card">
                <span>Tres actifs</span>
                <strong>{formatCount(playerMetrics.veryActive)}</strong>
                <p>Activite reelle observee sur les 3 derniers jours.</p>
              </article>
              <article className="overview-card">
                <span>Actifs</span>
                <strong>{formatCount(playerMetrics.active)}</strong>
                <p>Activite observee entre 4 et 14 jours.</p>
              </article>
              <article className="overview-card">
                <span>A relancer</span>
                <strong>{formatCount(playerMetrics.toRelaunch)}</strong>
                <p>Segment deja utilise dans la logique admin des joueurs.</p>
              </article>
              <article className="overview-card">
                <span>Inactifs</span>
                <strong>{formatCount(players.filter((player) => player.assiduityLabel === "Inactif").length)}</strong>
                <p>Aucune activite recente detectee au dela de 45 jours.</p>
              </article>
              <article className="overview-card">
                <span>Jamais actifs</span>
                <strong>{formatCount(playerMetrics.neverActive)}</strong>
                <p>Utilisateurs sans `last_real_activity_at` exploitable.</p>
              </article>
            </div>

            <div className="rankings-section-links">
              <Link className="secondary-button" href="/admin/joueurs">
                Voir les joueurs
              </Link>
              <Link className="secondary-button" href="/admin/joueurs">
                Voir les joueurs inactifs
              </Link>
              <a className="secondary-button" href="#menu-activite">Retour au menu</a>
            </div>
          </div>

          <div className="panel panel-wide" id="activite-commercants">
            <div className="panel-heading">
              <h2>Activite commercants</h2>
              <p>{formatCount(merchantMetrics.registered)} enseigne(s) analysees pour le funnel d activation.</p>
              <a className="secondary-button" href="#menu-activite">Retour au menu</a>
            </div>

            <div className="overview-grid">
              <article className="overview-card">
                <span>Commercants inscrits</span>
                <strong>{formatCount(merchantMetrics.registered)}</strong>
                <p>Total des documents `enseignes` remontes dans l admin.</p>
              </article>
              <article className="overview-card">
                <span>Avec au moins un jeu</span>
                <strong>{formatCount(merchantMetrics.withGames)}</strong>
                <p>Mesure via le nombre de jeux lies au owner de l enseigne.</p>
              </article>
              <article className="overview-card">
                <span>Sans jeu</span>
                <strong>{formatCount(merchantMetrics.withoutGames)}</strong>
                <p>Inscrits mais sans jeu rattache de facon exploitable.</p>
              </article>
              <article className="overview-card">
                <span>Avec au moins une participation</span>
                <strong>{formatCount(merchantMetrics.withParticipation)}</strong>
                <p>Signal minimal de traction reellement exploitable.</p>
              </article>
              <article className="overview-card">
                <span>Sans premiere participation</span>
                <strong>{formatCount(merchantMetrics.withoutFirstParticipation)}</strong>
                <p>Ont cree au moins un jeu mais n ont pas encore active leur premier trafic.</p>
              </article>
              <article className="overview-card">
                <span>Lancement recent 30 jours</span>
                <strong>{formatCount(merchantMetrics.recentlyLaunched)}</strong>
                <p>Base sur la date de debut du jeu le plus recent de l enseigne.</p>
              </article>
            </div>

            <div className="rankings-section-links">
              <Link className="secondary-button" href="/admin/commercants">
                Voir les commercants
              </Link>
              <Link className="secondary-button" href="/admin/commercants">
                Voir les commercants a relancer
              </Link>
              <Link className="secondary-button" href="/admin/commercants">
                Voir sans premiere participation
              </Link>
              <a className="secondary-button" href="#menu-activite">Retour au menu</a>
            </div>
          </div>

          <div className="panel panel-wide" id="activite-segments">
            <div className="panel-heading">
              <h2>Segments utiles</h2>
              <p>Quelques groupes actionnables rapidement sans ajouter de logique analytique lourde.</p>
              <a className="secondary-button" href="#menu-activite">Retour au menu</a>
            </div>

            <div className="overview-grid">
              <article className="overview-card">
                <span>Joueurs a relancer</span>
                <strong>{formatCount(playerMetrics.toRelaunch)}</strong>
                <p>Segment base sur la meme assiduite que la page `/admin/joueurs`.</p>
              </article>
              <article className="overview-card">
                <span>Joueurs jamais actifs</span>
                <strong>{formatCount(playerMetrics.neverActive)}</strong>
                <p>
                  Exemples :{" "}
                  {usefulSegments.inactivePlayers.length > 0
                    ? usefulSegments.inactivePlayers.map((player) => getPlayerLabel(player)).join(", ")
                    : "aucun"}
                </p>
              </article>
              <article className="overview-card">
                <span>Commercants sans jeu</span>
                <strong>{formatCount(merchantMetrics.withoutGames)}</strong>
                <p>Premier blocage d activation commercant visible avec la structure actuelle.</p>
              </article>
              <article className="overview-card">
                <span>Commercants sans premiere participation</span>
                <strong>{formatCount(merchantMetrics.withoutFirstParticipation)}</strong>
                <p>
                  Exemples :{" "}
                  {usefulSegments.merchantsWithoutParticipation.length > 0
                    ? usefulSegments.merchantsWithoutParticipation.map((merchant) => merchant.name).join(", ")
                    : "aucun"}
                </p>
              </article>
            </div>

            <div className="rankings-section-links">
              <Link className="secondary-button" href="/admin/joueurs">
                Ouvrir les joueurs
              </Link>
              <Link className="secondary-button" href="/admin/commercants">
                Ouvrir les commercants
              </Link>
              <a className="secondary-button" href="#menu-activite">Retour au menu</a>
              <a className="secondary-button" href="#menu-activite">Retour en haut</a>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
