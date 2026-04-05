"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getGamesList,
  getMerchantsList,
  getPlayersList,
  getReferralOverview,
  type AdminGameListItem,
  type AdminMerchantListItem,
  type AdminPlayerListItem,
  type AdminReferralInviterListItem,
} from "@/lib/firebase/adminQueries";

type MerchantSort = "clicks" | "participations" | "followers" | "name";
type GameSort = "views" | "participations" | "end_date" | "name";
type PlayerSort = "games_played" | "wins" | "activity" | "name";
type ReferralSort = "invitees" | "rewards" | "activity" | "name";

function formatCount(value: number | null) {
  if (value === null) {
    return "Non renseigne";
  }

  return new Intl.NumberFormat("fr-FR").format(value);
}

function normalizeString(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getMerchantStatusKey(merchant: AdminMerchantListItem) {
  const recentGameWindowInMs = 7 * 24 * 60 * 60 * 1000;
  const hasRecentlyStartedGame =
    merchant.latestGameStartValue > 0 &&
    Date.now() - merchant.latestGameStartValue <= recentGameWindowInMs;

  if (merchant.activeGamesCount > 0 || hasRecentlyStartedGame) {
    return "actif";
  }

  if (merchant.participationsCount < 10 || merchant.followersCount === 0) {
    return "a_relancer";
  }

  return "actif";
}

function getMerchantStatusLabel(merchant: AdminMerchantListItem) {
  return getMerchantStatusKey(merchant) === "a_relancer" ? "A relancer" : "Actif";
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

export default function AdminRankingsPage() {
  const [merchants, setMerchants] = useState<AdminMerchantListItem[]>([]);
  const [games, setGames] = useState<AdminGameListItem[]>([]);
  const [players, setPlayers] = useState<AdminPlayerListItem[]>([]);
  const [referrers, setReferrers] = useState<AdminReferralInviterListItem[]>([]);
  const [search, setSearch] = useState("");
  const [merchantSort, setMerchantSort] = useState<MerchantSort>("participations");
  const [gameSort, setGameSort] = useState<GameSort>("participations");
  const [playerSort, setPlayerSort] = useState<PlayerSort>("games_played");
  const [referralSort, setReferralSort] = useState<ReferralSort>("invitees");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadRankings = async () => {
      setLoading(true);
      setError(null);

      try {
        const [merchantItems, gameItems, playerItems, referralOverview] = await Promise.all([
          getMerchantsList(),
          getGamesList(),
          getPlayersList(),
          getReferralOverview(),
        ]);

        if (!isCancelled) {
          setMerchants(merchantItems);
          setGames(gameItems);
          setPlayers(playerItems);
          setReferrers(referralOverview.inviters);
        }
      } catch (loadError) {
        console.error(loadError);

        if (!isCancelled) {
          setError("Impossible de charger les classements depuis Firestore.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadRankings();

    return () => {
      isCancelled = true;
    };
  }, []);

  const normalizedSearch = normalizeString(search.trim());

  const rankedMerchants = useMemo(() => {
    const items = merchants.filter((merchant) => {
      return (
        normalizedSearch.length === 0 ||
        normalizeString(merchant.name).includes(normalizedSearch) ||
        normalizeString(merchant.city).includes(normalizedSearch)
      );
    });

    return [...items].sort((left, right) => {
      switch (merchantSort) {
        case "clicks":
          if (right.clicksCount !== left.clicksCount) {
            return right.clicksCount - left.clicksCount;
          }
          break;
        case "followers":
          if (right.followersCount !== left.followersCount) {
            return right.followersCount - left.followersCount;
          }
          break;
        case "name":
          return left.name.localeCompare(right.name, "fr");
        default:
          if (right.participationsCount !== left.participationsCount) {
            return right.participationsCount - left.participationsCount;
          }
      }

      return left.name.localeCompare(right.name, "fr");
    });
  }, [merchantSort, merchants, normalizedSearch]);

  const rankedGames = useMemo(() => {
    const items = games.filter((game) => {
      return (
        normalizedSearch.length === 0 ||
        normalizeString(game.name).includes(normalizedSearch) ||
        normalizeString(game.enseigneName).includes(normalizedSearch)
      );
    });

    return [...items].sort((left, right) => {
      switch (gameSort) {
        case "views":
          if (right.clicksCount !== left.clicksCount) {
            return right.clicksCount - left.clicksCount;
          }
          break;
        case "end_date":
          if (left.endDateValue !== right.endDateValue) {
            return left.endDateValue - right.endDateValue;
          }
          break;
        case "name":
          return left.name.localeCompare(right.name, "fr");
        default:
          if (right.participationsCount !== left.participationsCount) {
            return right.participationsCount - left.participationsCount;
          }
      }

      return left.name.localeCompare(right.name, "fr");
    });
  }, [gameSort, games, normalizedSearch]);

  const rankedPlayers = useMemo(() => {
    const items = players.filter((player) => {
      return (
        normalizedSearch.length === 0 ||
        normalizeString(getPlayerLabel(player)).includes(normalizedSearch) ||
        normalizeString(player.pseudo).includes(normalizedSearch) ||
        normalizeString(player.city).includes(normalizedSearch)
      );
    });

    return [...items].sort((left, right) => {
      switch (playerSort) {
        case "wins":
          if ((right.winsCount ?? -1) !== (left.winsCount ?? -1)) {
            return (right.winsCount ?? -1) - (left.winsCount ?? -1);
          }
          break;
        case "activity":
          if (right.lastRealActivityValue !== left.lastRealActivityValue) {
            return right.lastRealActivityValue - left.lastRealActivityValue;
          }
          break;
        case "name":
          return getPlayerLabel(left).localeCompare(getPlayerLabel(right), "fr");
        default:
          if ((right.gamesPlayedCount ?? -1) !== (left.gamesPlayedCount ?? -1)) {
            return (right.gamesPlayedCount ?? -1) - (left.gamesPlayedCount ?? -1);
          }
      }

      return getPlayerLabel(left).localeCompare(getPlayerLabel(right), "fr");
    });
  }, [normalizedSearch, playerSort, players]);

  const rankedReferrers = useMemo(() => {
    const items = referrers.filter((referrer) => {
      return (
        normalizedSearch.length === 0 ||
        normalizeString(referrer.label).includes(normalizedSearch) ||
        normalizeString(referrer.email).includes(normalizedSearch) ||
        normalizeString(referrer.searchableInviteCodes).includes(normalizedSearch)
      );
    });

    return [...items].sort((left, right) => {
      switch (referralSort) {
        case "rewards":
          if (right.grantedRewardsCount !== left.grantedRewardsCount) {
            return right.grantedRewardsCount - left.grantedRewardsCount;
          }
          break;
        case "activity":
          if (right.lastAcceptedAtValue !== left.lastAcceptedAtValue) {
            return right.lastAcceptedAtValue - left.lastAcceptedAtValue;
          }
          break;
        case "name":
          return left.label.localeCompare(right.label, "fr");
        default:
          if (right.acceptedInviteesCount !== left.acceptedInviteesCount) {
            return right.acceptedInviteesCount - left.acceptedInviteesCount;
          }
      }

      return left.label.localeCompare(right.label, "fr");
    });
  }, [normalizedSearch, referralSort, referrers]);

  const topMerchant = rankedMerchants[0] ?? null;
  const topGame = rankedGames[0] ?? null;
  const topPlayer = rankedPlayers[0] ?? null;
  const topReferrer = rankedReferrers[0] ?? null;

  return (
    <section className="content-grid" id="menu-classements">
      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Classements</h2>
          <p>
            Vue admin orientee lecture pour reperer rapidement les leaders cote commercants, jeux
            et joueurs, a partir des donnees deja disponibles dans l admin.
          </p>
        </div>

        <div className="overview-grid rankings-kpi-grid">
          <article className="overview-card">
            <span>Top commercant</span>
            <strong>{topMerchant ? topMerchant.name : "Aucun"}</strong>
            <p>{topMerchant ? `${formatCount(topMerchant.participationsCount)} participations` : "Aucune donnee"}</p>
          </article>
          <article className="overview-card">
            <span>Top jeu</span>
            <strong>{topGame ? topGame.name : "Aucun"}</strong>
            <p>{topGame ? `${formatCount(topGame.participationsCount)} participations` : "Aucune donnee"}</p>
          </article>
          <article className="overview-card">
            <span>Top joueur</span>
            <strong>{topPlayer ? getPlayerLabel(topPlayer) : "Aucun"}</strong>
            <p>{topPlayer ? `${formatCount(topPlayer.gamesPlayedCount)} parties` : "Aucune donnee"}</p>
          </article>
          <article className="overview-card">
            <span>Top parrain</span>
            <strong>{topReferrer ? topReferrer.label : "Aucun"}</strong>
            <p>{topReferrer ? `${formatCount(topReferrer.acceptedInviteesCount)} filleuls` : "Aucune donnee"}</p>
          </article>
        </div>

        <div className="games-toolbar rankings-toolbar">
          <label className="search-field">
            <span className="search-label">Recherche</span>
            <input
              className="search-input"
              type="search"
              placeholder="Nom, ville, enseigne, pseudo"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        <nav className="rankings-nav" aria-label="Sections classements">
          <a className="filter-chip" href="#classement-commercants">
            Commercants
          </a>
          <a className="filter-chip" href="#classement-jeux">
            Jeux
          </a>
          <a className="filter-chip" href="#classement-joueurs">
            Joueurs
          </a>
          <a className="filter-chip" href="#classement-parrains">
            Parrains
          </a>
        </nav>

        {loading ? <p className="feedback neutral">Chargement des classements...</p> : null}
        {error ? <p className="feedback error">{error}</p> : null}
      </div>

      {!loading && !error ? (
        <>
          <div className="panel panel-wide" id="classement-commercants">
            <div className="panel-heading">
              <h2>Classement commercants</h2>
              <p>{rankedMerchants.length} commercant(s) affiches.</p>
              <a className="secondary-button" href="#menu-classements">Retour au menu</a>
            </div>

            <div className="games-toolbar rankings-section-toolbar">
              <label className="search-field">
                <span className="search-label">Tri</span>
                <select value={merchantSort} onChange={(event) => setMerchantSort(event.target.value as MerchantSort)}>
                  <option value="participations">Participations decroissantes</option>
                  <option value="clicks">Clics decroissants</option>
                  <option value="followers">Followers decroissants</option>
                  <option value="name">Nom A-Z</option>
                </select>
              </label>
            </div>

            <div className="games-table-body">
              <div className="rankings-table-header rankings-merchants-header">
                <span>Rang</span>
                <span>Commercant</span>
                <span>Ville</span>
                <span>Clics</span>
                <span>Participations</span>
                <span>Followers</span>
                <span>Statut</span>
                <span>Action</span>
              </div>

              {rankedMerchants.map((merchant, index) => (
                <article key={merchant.id} className="rankings-table-row rankings-merchants-row">
                  <div className="games-cell" data-label="Rang">
                    <strong>#{index + 1}</strong>
                  </div>
                  <div className="games-cell" data-label="Commercant">
                    <strong>{merchant.name}</strong>
                  </div>
                  <div className="games-cell" data-label="Ville">
                    <strong>{merchant.city || "Non renseignee"}</strong>
                  </div>
                  <div className="games-cell" data-label="Clics">
                    <strong>{formatCount(merchant.clicksCount)}</strong>
                  </div>
                  <div className="games-cell" data-label="Participations">
                    <strong>{formatCount(merchant.participationsCount)}</strong>
                  </div>
                  <div className="games-cell" data-label="Followers">
                    <strong>{formatCount(merchant.followersCount)}</strong>
                  </div>
                  <div className="games-cell" data-label="Statut">
                    <span className={`rankings-status-badge ${getMerchantStatusKey(merchant)}`}>
                      {getMerchantStatusLabel(merchant)}
                    </span>
                  </div>
                  <div className="games-cell rankings-actions-cell" data-label="Action">
                    <Link className="secondary-button" href={`/admin/commercants/${merchant.id}`}>
                      Voir
                    </Link>
                  </div>
                </article>
              ))}
            </div>

            <div className="rankings-section-links">
              <a className="secondary-button" href="#menu-classements">Retour au menu</a>
              <a className="secondary-button" href="#menu-classements">Retour en haut</a>
            </div>
          </div>

          <div className="panel panel-wide" id="classement-jeux">
            <div className="panel-heading">
              <h2>Classement jeux</h2>
              <p>{rankedGames.length} jeu(x) affiches.</p>
              <a className="secondary-button" href="#menu-classements">Retour au menu</a>
            </div>

            <div className="games-toolbar rankings-section-toolbar">
              <label className="search-field">
                <span className="search-label">Tri</span>
                <select value={gameSort} onChange={(event) => setGameSort(event.target.value as GameSort)}>
                  <option value="participations">Participations decroissantes</option>
                  <option value="views">Vues decroissantes</option>
                  <option value="end_date">Fin proche</option>
                  <option value="name">Nom A-Z</option>
                </select>
              </label>
            </div>

            <div className="games-table-body">
              <div className="rankings-table-header rankings-games-header">
                <span>Rang</span>
                <span>Jeu</span>
                <span>Commercant</span>
                <span>Vues</span>
                <span>Participations</span>
                <span>Fin</span>
                <span>Statut</span>
                <span>Action</span>
              </div>

              {rankedGames.map((game, index) => (
                <article key={game.id} className="rankings-table-row rankings-games-row">
                  <div className="games-cell" data-label="Rang">
                    <strong>#{index + 1}</strong>
                  </div>
                  <div className="games-cell" data-label="Jeu">
                    <strong>{game.name}</strong>
                  </div>
                  <div className="games-cell" data-label="Commercant">
                    <strong>{game.enseigneName}</strong>
                  </div>
                  <div className="games-cell" data-label="Vues">
                    <strong>{formatCount(game.clicksCount)}</strong>
                  </div>
                  <div className="games-cell" data-label="Participations">
                    <strong>{formatCount(game.participationsCount)}</strong>
                  </div>
                  <div className="games-cell" data-label="Fin">
                    <strong>{game.endDateLabel}</strong>
                  </div>
                  <div className="games-cell" data-label="Statut">
                    <span className={`rankings-status-badge ${game.status}`}>{game.status}</span>
                  </div>
                  <div className="games-cell rankings-actions-cell" data-label="Action">
                    <Link className="secondary-button" href={`/admin/games/${game.id}`}>
                      Voir
                    </Link>
                  </div>
                </article>
              ))}
            </div>

            <div className="rankings-section-links">
              <a className="secondary-button" href="#menu-classements">Retour au menu</a>
              <a className="secondary-button" href="#menu-classements">Retour en haut</a>
            </div>
          </div>

          <div className="panel panel-wide" id="classement-joueurs">
            <div className="panel-heading">
              <h2>Classement joueurs</h2>
              <p>{rankedPlayers.length} joueur(s) affiches.</p>
              <a className="secondary-button" href="#menu-classements">Retour au menu</a>
            </div>

            <div className="games-toolbar rankings-section-toolbar">
              <label className="search-field">
                <span className="search-label">Tri</span>
                <select value={playerSort} onChange={(event) => setPlayerSort(event.target.value as PlayerSort)}>
                  <option value="games_played">Parties decroissantes</option>
                  <option value="wins">Gains decroissants</option>
                  <option value="activity">Derniere activite recente</option>
                  <option value="name">Nom A-Z</option>
                </select>
              </label>
            </div>

            <div className="games-table-body">
              <div className="rankings-table-header rankings-players-header">
                <span>Rang</span>
                <span>Joueur</span>
                <span>Ville</span>
                <span>Parties</span>
                <span>Gains</span>
                <span>Assiduite</span>
                <span>Derniere activite</span>
                <span>Action</span>
              </div>

              {rankedPlayers.map((player, index) => (
                <article key={player.id} className="rankings-table-row rankings-players-row">
                  <div className="games-cell" data-label="Rang">
                    <strong>#{index + 1}</strong>
                  </div>
                  <div className="games-cell" data-label="Joueur">
                    <strong>{getPlayerLabel(player)}</strong>
                    <span>{player.email}</span>
                  </div>
                  <div className="games-cell" data-label="Ville">
                    <strong>{player.city}</strong>
                  </div>
                  <div className="games-cell" data-label="Parties">
                    <strong>{formatCount(player.gamesPlayedCount)}</strong>
                  </div>
                  <div className="games-cell" data-label="Gains">
                    <strong>{formatCount(player.winsCount)}</strong>
                  </div>
                  <div className="games-cell" data-label="Assiduite">
                    <span className={`rankings-status-badge ${player.activityState}`}>{player.assiduityLabel}</span>
                  </div>
                  <div className="games-cell" data-label="Derniere activite">
                    <strong>{player.lastRealActivityLabel}</strong>
                  </div>
                  <div className="games-cell rankings-actions-cell" data-label="Action">
                    <Link className="secondary-button" href={`/admin/joueurs/${player.id}`}>
                      Voir detail
                    </Link>
                  </div>
                </article>
              ))}
            </div>

            <div className="rankings-section-links">
              <a className="secondary-button" href="#menu-classements">Retour au menu</a>
              <a className="secondary-button" href="#menu-classements">Retour en haut</a>
            </div>
          </div>

          <div className="panel panel-wide" id="classement-parrains">
            <div className="panel-heading">
              <h2>Classement parrains</h2>
              <p>{rankedReferrers.length} parrain(s) affiches.</p>
              <a className="secondary-button" href="#menu-classements">Retour au menu</a>
            </div>

            <div className="games-toolbar rankings-section-toolbar">
              <label className="search-field">
                <span className="search-label">Tri</span>
                <select value={referralSort} onChange={(event) => setReferralSort(event.target.value as ReferralSort)}>
                  <option value="invitees">Filleuls decroissants</option>
                  <option value="rewards">Bonus accordes decroissants</option>
                  <option value="activity">Derniere utilisation recente</option>
                  <option value="name">Nom A-Z</option>
                </select>
              </label>
            </div>

            <div className="games-table-body">
              <div className="rankings-table-header rankings-referrals-header">
                <span>Rang</span>
                <span>Parrain</span>
                <span>Code</span>
                <span>Parrainages envoyes</span>
                <span>Filleuls</span>
                <span>Bonus accordes</span>
                <span>Derniere utilisation</span>
                <span>Statut bonus</span>
                <span>Action</span>
              </div>

              {rankedReferrers.map((referrer, index) => (
                <article key={referrer.userId} className="rankings-table-row rankings-referrals-row">
                  <div className="games-cell" data-label="Rang">
                    <strong>#{index + 1}</strong>
                  </div>
                  <div className="games-cell" data-label="Parrain">
                    <strong>{referrer.label}</strong>
                    <span>{referrer.email}</span>
                  </div>
                  <div className="games-cell" data-label="Code">
                    <strong>{referrer.latestInviteCode}</strong>
                  </div>
                  <div className="games-cell" data-label="Parrainages envoyes">
                    <strong>{formatCount(referrer.acceptedInviteesCount + referrer.pendingReferralsCount)}</strong>
                    <span>{formatCount(referrer.pendingReferralsCount)} en attente</span>
                  </div>
                  <div className="games-cell" data-label="Filleuls">
                    <strong>{formatCount(referrer.acceptedInviteesCount)}</strong>
                  </div>
                  <div className="games-cell" data-label="Bonus accordes">
                    <strong>{formatCount(referrer.grantedRewardsCount)}</strong>
                  </div>
                  <div className="games-cell" data-label="Derniere utilisation">
                    <strong>{referrer.lastAcceptedAtLabel}</strong>
                  </div>
                  <div className="games-cell" data-label="Statut bonus">
                    <span className={`rankings-status-badge ${referrer.bonusStatus}`}>{referrer.bonusStatusLabel}</span>
                  </div>
                  <div className="games-cell rankings-actions-cell" data-label="Action">
                    <Link className="secondary-button" href={`/admin/parrainage/${referrer.userId}`}>
                      Voir
                    </Link>
                  </div>
                </article>
              ))}
            </div>

            <div className="rankings-section-links">
              <a className="secondary-button" href="#menu-classements">Retour au menu</a>
              <a className="secondary-button" href="#menu-classements">Retour en haut</a>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
