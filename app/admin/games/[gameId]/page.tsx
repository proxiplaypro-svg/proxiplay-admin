"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  type DocumentReference,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client-app";

type GameDetailsPageProps = {
  params: Promise<{
    gameId: string;
  }>;
};

type FirestoreGameDetailsDocument = {
  name?: string;
  description?: string;
  prize_value?: number;
  start_date?: Timestamp;
  end_date?: Timestamp;
  enseigne_id?: DocumentReference;
  enseigne_name?: string;
  game_type?: string;
  hasMainPrize?: boolean;
  hasWinner?: boolean;
  main_prize_winner?: DocumentReference | null;
  visible_public?: boolean;
  created_at?: Timestamp;
  updated_at?: Timestamp;
  last_activity_at?: Timestamp;
};

type FirestoreParticipantDocument = {
  user_id?: DocumentReference | null;
};

type AdminGameDetails = {
  id: string;
  name: string;
  merchantId: string | null;
  merchantName: string;
  status: "actif" | "termine" | "brouillon";
  startDateLabel: string;
  endDateLabel: string;
  startDateValue: number;
  endDateValue: number;
  participationsCount: number;
  uniquePlayersCount: number;
  winnersCount: number;
  conversionRateLabel: string;
  performanceTone: "hot" | "warning" | "danger";
  performanceLabel: string;
  description: string;
  gameType: string;
  mainPrizeLabel: string;
  hasMainPrize: boolean;
  alerts: string[];
  createdAtLabel: string;
  lastActivityLabel: string;
  dataSummary: string[];
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(Number.isFinite(value) ? value : 0);
}

function getGameDetailsErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "permission-denied":
        return "Connexion requise pour lire la fiche du jeu.";
      case "unavailable":
        return "Firestore est temporairement indisponible. Reessaie dans un instant.";
      default:
        return "Impossible de charger la fiche du jeu pour le moment.";
    }
  }

  return "Impossible de charger la fiche du jeu pour le moment.";
}

function getGameStatus(game: FirestoreGameDetailsDocument, now = new Date()) {
  const startDate = game.start_date?.toDate();
  const endDate = game.end_date?.toDate();

  if (!game.visible_public) {
    return "brouillon" as const;
  }

  if (endDate && endDate.getTime() < now.getTime()) {
    return "termine" as const;
  }

  if (
    startDate &&
    endDate &&
    startDate.getTime() <= now.getTime() &&
    endDate.getTime() >= now.getTime()
  ) {
    return "actif" as const;
  }

  return "brouillon" as const;
}

function getStatusLabel(status: AdminGameDetails["status"]) {
  switch (status) {
    case "actif":
      return "Actif";
    case "termine":
      return "Termine";
    default:
      return "Brouillon";
  }
}

function buildGameDetails(
  gameId: string,
  game: FirestoreGameDetailsDocument,
  participationsCount: number,
  uniquePlayersCount: number,
  winnersCount: number,
) {
  const now = new Date();
  const startDate = game.start_date?.toDate() ?? null;
  const endDate = game.end_date?.toDate() ?? null;
  const status = getGameStatus(game, now);
  const conversionRate =
    participationsCount > 0 ? (winnersCount / participationsCount) * 100 : null;

  const alerts: string[] = [];
  if (status === "actif" && participationsCount === 0) {
    alerts.push("Jeu actif sans aucune participation.");
  }

  if (game.visible_public === true && endDate && endDate.getTime() < now.getTime()) {
    alerts.push("Date de fin depassee alors que le jeu reste publie.");
  }

  let performanceTone: AdminGameDetails["performanceTone"] = "hot";
  let performanceLabel = "🔥 actif";

  if (participationsCount === 0) {
    performanceTone = "danger";
    performanceLabel = "❌ aucune activite";
  } else if (participationsCount < 10 || alerts.length > 0) {
    performanceTone = "warning";
    performanceLabel = "⚠️ faible";
  }

  const createdAt = game.created_at?.toDate() ?? null;
  const lastActivityAt = game.last_activity_at?.toDate() ?? game.updated_at?.toDate() ?? null;
  const mainPrizeLabel = game.hasMainPrize
    ? typeof game.prize_value === "number"
      ? `Valeur estimee ${formatCurrency(game.prize_value)}`
      : "Lot principal present"
    : "Aucun lot principal detecte";

  return {
    id: gameId,
    name: game.name?.trim() || "Jeu sans nom",
    merchantId: game.enseigne_id?.id ?? null,
    merchantName: game.enseigne_name?.trim() || "Commercant non renseigne",
    status,
    startDateLabel: startDate ? formatDate(startDate) : "Non disponible",
    endDateLabel: endDate ? formatDate(endDate) : "Non disponible",
    startDateValue: startDate?.getTime() ?? 0,
    endDateValue: endDate?.getTime() ?? 0,
    participationsCount,
    uniquePlayersCount,
    winnersCount,
    conversionRateLabel: conversionRate === null ? "N/A" : `${conversionRate.toFixed(1)} %`,
    performanceTone,
    performanceLabel,
    description: game.description?.trim() || "Aucune description disponible.",
    gameType: game.game_type?.trim() || "Non renseigne",
    mainPrizeLabel,
    hasMainPrize: game.hasMainPrize === true,
    alerts,
    createdAtLabel: createdAt ? formatDate(createdAt) : "Non disponible",
    lastActivityLabel: lastActivityAt ? formatDate(lastActivityAt) : "Non disponible",
    dataSummary: [
      "Document Firestore `games/{gameId}`",
      "Sous-collection `participants` pour le compteur",
      "Collection `prizes` pour le nombre de gagnants",
      "Champs derives localement: statut, taux simple et alertes",
    ],
  } satisfies AdminGameDetails;
}

export default function GameDetailsPage({ params }: GameDetailsPageProps) {
  const [game, setGame] = useState<AdminGameDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadGame = async () => {
      setLoading(true);
      setError(null);

      try {
        const resolvedParams = await params;
        const gameRef = doc(db, "games", resolvedParams.gameId);
        const gameSnapshot = await getDoc(gameRef);

        if (isCancelled) {
          return;
        }

        if (!gameSnapshot.exists()) {
          setGame(null);
          setError("Jeu introuvable.");
          return;
        }

        const [participantsCountSnapshot, participantsDocsSnapshot, prizesSnapshot] = await Promise.all([
          getCountFromServer(collection(gameRef, "participants")),
          getDocs(collection(gameRef, "participants")),
          getDocs(collection(db, "prizes")),
        ]);

        if (isCancelled) {
          return;
        }

        const uniquePlayersCount = new Set(
          participantsDocsSnapshot.docs
            .map((participantDoc) => {
              const participant = participantDoc.data() as FirestoreParticipantDocument;
              return participant.user_id?.id ?? null;
            })
            .filter((userId): userId is string => Boolean(userId)),
        ).size;
        const safeUniquePlayersCount = Number.isFinite(uniquePlayersCount) ? uniquePlayersCount : 0;

        const winnersCount = prizesSnapshot.docs.reduce((total, prizeDoc) => {
          const prizeGameRef = prizeDoc.get("game_id");
          return prizeGameRef?.id === resolvedParams.gameId ? total + 1 : total;
        }, 0);

        const details = buildGameDetails(
          resolvedParams.gameId,
          gameSnapshot.data() as FirestoreGameDetailsDocument,
          participantsCountSnapshot.data().count,
          safeUniquePlayersCount,
          winnersCount,
        );

        setGame(details);
      } catch (loadError) {
        console.error(loadError);
        if (!isCancelled) {
          setGame(null);
          setError(getGameDetailsErrorMessage(loadError));
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadGame();

    return () => {
      isCancelled = true;
    };
  }, [params]);

  const infoCards = useMemo(() => {
    if (!game) {
      return [];
    }

    return [
      { label: "Description", value: game.description },
      { label: "Type de jeu", value: game.gameType },
      { label: "Lot principal", value: game.mainPrizeLabel },
      { label: "Nombre de gagnants", value: formatCount(game.winnersCount) },
    ];
  }, [game]);

  if (loading) {
    return (
      <section className="content-grid">
        <div className="panel panel-wide">
          <div className="game-details-skeleton">
            <span className="skeleton-line skeleton-label" />
            <strong className="skeleton-line skeleton-value" />
            <div className="dashboard-kpi-grid">
              {Array.from({ length: 4 }).map((_, index) => (
                <article key={index} className="dashboard-kpi-card skeleton-card">
                  <span className="skeleton-line skeleton-label" />
                  <strong className="skeleton-line skeleton-value" />
                  <small className="skeleton-line skeleton-helper" />
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (error || !game) {
    return (
      <section className="content-grid">
        <div className="panel panel-wide">
          <div className="empty-state">
            <strong>{error ?? "Jeu introuvable"}</strong>
            <p>Retourne a la liste des jeux pour selectionner un jeu valide.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading game-details-header">
          <div>
            <h2>{game.name}</h2>
            <p>Analyse detaillee du jeu pour pilotage commercial et suivi de coherence.</p>
          </div>

          <div className="game-details-header-actions">
            <Link className="row-link-button secondary" href={`/admin/games/${game.id}/edit`}>
              Editer
            </Link>
            {game.merchantId ? (
              <Link className="row-link-button" href={`/admin/commercants/${game.merchantId}`}>
                Voir commercant
              </Link>
            ) : null}
          </div>
        </div>

        <div className="game-details-meta-grid">
          <article className="overview-card">
            <span>Statut</span>
            <strong>
              <span className={`game-badge ${game.status === "brouillon" ? "a_venir" : game.status}`}>
                {getStatusLabel(game.status)}
              </span>
            </strong>
          </article>
          <article className="overview-card">
            <span>Commercant</span>
            <strong>{game.merchantName}</strong>
          </article>
          <article className="overview-card">
            <span>Date debut</span>
            <strong>{game.startDateLabel}</strong>
          </article>
          <article className="overview-card">
            <span>Date fin</span>
            <strong>{game.endDateLabel}</strong>
          </article>
        </div>
      </div>

      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Performance</h2>
          <p>Le bloc principal pour juger rapidement traction, volume et conversion simple.</p>
        </div>

        <div className="game-details-performance-grid">
          <article className="dashboard-kpi-card featured">
            <span>Badge visuel</span>
            <strong>{game.performanceLabel}</strong>
            <small>Lecture rapide de l activite du jeu.</small>
          </article>
          <article className="dashboard-kpi-card neutral">
            <span>Participations</span>
            <strong>{formatCount(game.participationsCount)}</strong>
            <small>Compteur de la sous-collection `participants`.</small>
          </article>
          <article className="dashboard-kpi-card neutral">
            <span>Joueurs uniques</span>
            <strong>{formatCount(game.uniquePlayersCount)}</strong>
            <small>Nombre de `user_id` distincts dans `participants`.</small>
          </article>
          <article className="dashboard-kpi-card neutral">
            <span>Gagnants</span>
            <strong>{formatCount(game.winnersCount)}</strong>
            <small>Nombre de documents `prizes` relies au jeu.</small>
          </article>
          <article className="dashboard-kpi-card neutral">
            <span>Taux simple</span>
            <strong>{game.conversionRateLabel}</strong>
            <small>Gagnants / participations.</small>
          </article>
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h2>Informations</h2>
          <p>Elements disponibles dans le document Firestore du jeu.</p>
        </div>

        <div className="dashboard-placeholder-grid">
          {infoCards.map((item) => (
            <article key={item.label} className="dashboard-placeholder-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h2>Coherence / alertes</h2>
          <p>Verifications simples derivees localement pour remonter les points d attention.</p>
        </div>

        {game.alerts.length === 0 ? (
          <div className="empty-state compact-empty-state">
            <strong>Aucune alerte bloquante</strong>
            <p>Les donnees actuellement visibles ne remontent pas d incoherence majeure.</p>
          </div>
        ) : (
          <div className="dashboard-feedback-stack">
            {game.alerts.map((alert) => (
              <div key={alert} className="dashboard-banner error">
                <strong>Alerte</strong>
                <p>{alert}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h2>Timeline</h2>
          <p>Chronologie simple a partir des timestamps disponibles dans Firestore.</p>
        </div>

        <div className="dashboard-placeholder-grid">
          <article className="dashboard-placeholder-card">
            <span>Creation</span>
            <strong>{game.createdAtLabel}</strong>
            <small>Champ `created_at` si disponible.</small>
          </article>
          <article className="dashboard-placeholder-card">
            <span>Derniere activite</span>
            <strong>{game.lastActivityLabel}</strong>
            <small>Champ `last_activity_at` ou `updated_at` si disponible.</small>
          </article>
        </div>
      </div>

      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Resume des donnees utilisees</h2>
          <p>Cette page ne touche pas au backend et derive uniquement ce qui est deja lisible cote client.</p>
        </div>

        <div className="action-list">
          {game.dataSummary.map((item) => (
            <article key={item} className="action-item">
              <span>{item}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
