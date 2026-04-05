"use client";

import { FirebaseError } from "firebase/app";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getRebuildAdminStatsErrorMessage,
  rebuildAdminStatsAction,
} from "@/lib/firebase/adminActions";
import { getDashboardStats, type AdminDashboardStats } from "@/lib/firebase/adminQueries";

type DashboardKpi = {
  label: string;
  value: number;
  tone?: "accent" | "neutral";
  helper: string;
};

type DashboardPlaceholderMetric = {
  label: string;
  value: string;
  helper: string;
  badge?: string;
  tone?: "ok" | "neutral" | "warning";
};

type DashboardSectionStat = {
  label: string;
  value: string;
};

const initialStats: AdminDashboardStats = {
  gamesCount: 0,
  activeGamesCount: 0,
  usersCount: 0,
  playersCount: 0,
  merchantsCount: 0,
  participationsCount: 0,
  winnersCount: 0,
  lastComputationAtLabel: null,
  updatedBy: null,
};

const activityPlaceholders: DashboardPlaceholderMetric[] = [
  {
    label: "Rythme du jour",
    value: "--",
    helper: "Participations du jour",
    badge: "Jour",
    tone: "neutral",
  },
  {
    label: "Traction 7 jours",
    value: "--",
    helper: "Lecture hebdomadaire",
    badge: "Hebdo",
    tone: "neutral",
  },
  {
    label: "Commercants actifs",
    value: "--",
    helper: "Points de vente engages",
    badge: "Commerce",
    tone: "neutral",
  },
];

const platformHealthPlaceholders: DashboardPlaceholderMetric[] = [
  {
    label: "Statut fonctions",
    value: "Stable",
    helper: "Backend nominal",
    badge: "Production",
    tone: "ok",
  },
  {
    label: "Latence moyenne",
    value: "-- ms",
    helper: "Temps de reponse",
    badge: "Perf",
    tone: "neutral",
  },
  {
    label: "Dernieres erreurs",
    value: "--",
    helper: "Incidents recents",
    badge: "Logs",
    tone: "warning",
  },
];

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatWinnerRate(winnersCount: number, participationsCount: number) {
  if (participationsCount <= 0) {
    return "N/A";
  }

  return `${((winnersCount / participationsCount) * 100).toFixed(1)} %`;
}

function getDashboardReadErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "unauthenticated":
        return "Connexion requise pour charger les stats du dashboard.";
      case "permission-denied":
        return "Acces admin requis pour lire les stats du dashboard.";
      case "unavailable":
        return "Firestore est temporairement indisponible. Reessaie dans un instant.";
      default:
        return "Impossible de charger les indicateurs du dashboard pour le moment.";
    }
  }

  return "Impossible de charger les indicateurs du dashboard pour le moment.";
}

function getRelativeUpdateLabel(lastComputationAtLabel: string | null) {
  if (!lastComputationAtLabel) {
    return "Mise a jour indisponible";
  }

  const normalized = lastComputationAtLabel
    .replaceAll(".", "")
    .replace("janv", "jan")
    .replace("fevr", "feb")
    .replace("avr", "apr")
    .replace("mai", "may")
    .replace("juin", "jun")
    .replace("juil", "jul")
    .replace("aout", "aug")
    .replace("sept", "sep")
    .replace("oct", "oct")
    .replace("nov", "nov")
    .replace("dec", "dec");

  const parsedDate = new Date(normalized);

  if (Number.isNaN(parsedDate.getTime())) {
    return `Mis a jour le ${lastComputationAtLabel}`;
  }

  const diffInMs = Date.now() - parsedDate.getTime();
  const diffInDays = Math.max(0, Math.floor(diffInMs / (1000 * 60 * 60 * 24)));

  if (diffInDays === 0) {
    return "Mis a jour aujourd hui";
  }

  if (diffInDays === 1) {
    return "Mis a jour hier";
  }

  if (diffInDays < 7) {
    return `Mis a jour il y a ${diffInDays} jours`;
  }

  return `Mis a jour le ${lastComputationAtLabel}`;
}

function hasDashboardData(stats: AdminDashboardStats) {
  return (
    stats.gamesCount > 0 ||
    stats.activeGamesCount > 0 ||
    stats.usersCount > 0 ||
    stats.playersCount > 0 ||
    stats.merchantsCount > 0 ||
    stats.participationsCount > 0 ||
    stats.winnersCount > 0 ||
    Boolean(stats.lastComputationAtLabel) ||
    Boolean(stats.updatedBy)
  );
}

function DashboardSection({
  title,
  description,
  eyebrow,
  stats,
  children,
}: {
  title: string;
  description: string;
  eyebrow: string;
  stats?: DashboardSectionStat[];
  children: ReactNode;
}) {
  return (
    <div className="panel dashboard-section-panel">
      <div className="dashboard-section-header">
        <div>
          <span className="dashboard-section-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {stats?.length ? (
          <div className="dashboard-section-stats" aria-label={`${title} resume`}>
            {stats.map((item) => (
              <div key={item.label} className="dashboard-section-stat">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats>(initialStats);
  const [isFetchingStats, setIsFetchingStats] = useState(true);
  const [isRebuildingStats, setIsRebuildingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsSuccess, setStatsSuccess] = useState<string | null>(null);

  const refreshCounts = async () => {
    setIsFetchingStats(true);
    setStatsError(null);

    try {
      const nextStats = await getDashboardStats();
      setStats(nextStats);
    } catch (error) {
      console.error(error);
      setStatsError(getDashboardReadErrorMessage(error));
    } finally {
      setIsFetchingStats(false);
    }
  };

  const rebuildCounts = async () => {
    if (isRebuildingStats || isFetchingStats) {
      return;
    }

    setIsRebuildingStats(true);
    setStatsError(null);
    setStatsSuccess(null);

    try {
      const result = await rebuildAdminStatsAction();
      setStatsSuccess(
        `Rebuild backend termine (${result.source}) a ${new Date(result.timestamp).toLocaleString("fr-FR")}.`,
      );
      await refreshCounts();
    } catch (error) {
      console.error(error);
      setStatsError(getRebuildAdminStatsErrorMessage(error));
    } finally {
      setIsRebuildingStats(false);
    }
  };

  useEffect(() => {
    void refreshCounts();
  }, []);

  const kpis = useMemo<DashboardKpi[]>(
    () => [
      {
        label: "Jeux actifs",
        value: stats.activeGamesCount,
        tone: "accent",
        helper: "Campagnes en cours",
      },
      {
        label: "Participations",
        value: stats.participationsCount,
        helper: "Volume global",
      },
      {
        label: "Joueurs",
        value: stats.playersCount || stats.usersCount,
        helper: "Base joueur",
      },
      {
        label: "Commercants",
        value: stats.merchantsCount,
        helper: "Enseignes suivies",
      },
      {
        label: "Jeux totaux",
        value: stats.gamesCount,
        helper: "Campagnes creees",
      },
      {
        label: "Gagnants",
        value: stats.winnersCount,
        helper: "Gains attribues",
      },
    ],
    [stats],
  );

  const isEmpty = !isFetchingStats && !statsError && !hasDashboardData(stats);
  const syncTone = statsError ? "error" : isFetchingStats || isRebuildingStats ? "warning" : "ok";
  const syncLabel = statsError
    ? "Erreur de synchronisation"
    : isRebuildingStats
      ? "Mise a jour en cours"
      : isFetchingStats
        ? "Synchronisation en cours"
        : "Synchronise";

  const summaryStats: DashboardSectionStat[] = [
    {
      label: "Source",
      value: stats.updatedBy || "admin_stats/global",
    },
    {
      label: "Derniere lecture",
      value: getRelativeUpdateLabel(stats.lastComputationAtLabel),
    },
    {
      label: "Gagnants / participations",
      value: formatWinnerRate(stats.winnersCount, stats.participationsCount),
    },
  ];

  const activityStats: DashboardSectionStat[] = [
    {
      label: "Base joueur",
      value: formatCount(stats.playersCount || stats.usersCount),
    },
    {
      label: "Jeux actifs",
      value: formatCount(stats.activeGamesCount),
    },
  ];

  const healthStats: DashboardSectionStat[] = [
    {
      label: "Sync",
      value: syncLabel,
    },
    {
      label: "Dernier calcul",
      value: stats.lastComputationAtLabel || "--",
    },
  ];

  return (
    <section className="content-grid dashboard-page-grid">
      <div className="panel panel-wide dashboard-hero-panel dashboard-hero-surface">
        <div className="dashboard-hero-content">
          <div className="panel-heading dashboard-hero-heading">
            <div className="dashboard-hero-copy">
              <h2>Dashboard</h2>
              <p>Vue admin sobre et fiable des indicateurs ProxiPlay.</p>
            </div>
            <div className="dashboard-meta">
              <span className={`status-pill ${syncTone}`}>{syncLabel}</span>
              <span className="dashboard-meta-text">{summaryStats[1]?.value}</span>
            </div>
          </div>

          <div className="dashboard-hero-actions">
            <button
              className="primary-button dashboard-primary-action"
              type="button"
              onClick={() => void refreshCounts()}
              disabled={isFetchingStats || isRebuildingStats}
            >
              {isFetchingStats ? "Chargement..." : "Rafraichir l affichage"}
            </button>
          </div>
        </div>

        <div className="dashboard-feedback-stack">
          {statsError ? (
            <div className="dashboard-banner error">
              <strong>Le dashboard n a pas pu etre charge.</strong>
              <p>{statsError}</p>
            </div>
          ) : null}

          {statsSuccess ? (
            <div className="dashboard-banner success">
              <strong>Statistiques rafraichies.</strong>
              <p>{statsSuccess}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel panel-wide dashboard-section-panel dashboard-kpi-panel">
        <div className="dashboard-section-header">
          <div>
            <span className="dashboard-section-eyebrow">KPIs principaux</span>
            <h2>Main KPIs</h2>
            <p>Les indicateurs prioritaires sont plus denses, mieux hierarchises et plus lisibles.</p>
          </div>
          <div className="dashboard-section-stats">
            <div className="dashboard-section-stat">
              <span>Joueurs</span>
              <strong>{formatCount(stats.playersCount || stats.usersCount)}</strong>
            </div>
            <div className="dashboard-section-stat">
              <span>Gagnants</span>
              <strong>{formatCount(stats.winnersCount)}</strong>
            </div>
            <div className="dashboard-section-stat">
              <span>Gagnants / participations</span>
              <strong>{formatWinnerRate(stats.winnersCount, stats.participationsCount)}</strong>
            </div>
          </div>
        </div>

        {isFetchingStats ? (
          <div className="dashboard-kpi-grid">
            <article className="dashboard-kpi-card featured skeleton-card">
              <span className="skeleton-line skeleton-label" />
              <strong className="skeleton-line skeleton-value" />
              <small className="skeleton-line skeleton-helper" />
            </article>
            {Array.from({ length: 5 }).map((_, index) => (
              <article key={index} className="dashboard-kpi-card skeleton-card">
                <span className="skeleton-line skeleton-label" />
                <strong className="skeleton-line skeleton-value" />
                <small className="skeleton-line skeleton-helper" />
              </article>
            ))}
          </div>
        ) : isEmpty ? (
          <div className="empty-state dashboard-empty-state">
            <strong>Aucune statistique disponible pour le moment</strong>
            <p>
              Le document `admin_stats/global` ne contient pas encore de valeurs exploitables.
              Lance un recalcul pour initialiser le dashboard.
            </p>
          </div>
        ) : (
          <div className="dashboard-kpi-grid">
            {kpis.map((item, index) => (
              <article
                key={item.label}
                className={`dashboard-kpi-card ${
                  index === 0 || item.tone === "accent" ? "featured" : "neutral"
                }`}
              >
                <div className="dashboard-kpi-topline">
                  <span>{item.label}</span>
                  <small className={`dashboard-kpi-badge ${item.tone === "accent" ? "accent" : "neutral"}`}>
                    {index === 0 ? "Priorite" : "Suivi"}
                  </small>
                </div>
                <strong>{formatCount(item.value)}</strong>
                <small>{item.helper}</small>
              </article>
            ))}
          </div>
        )}
      </div>

      <DashboardSection
        title="Activity"
        description="Une mise en page plus compacte et plus admin, meme quand certaines valeurs restent reservees."
        eyebrow="Activite"
        stats={activityStats}
      >
        <div className="dashboard-placeholder-grid dashboard-placeholder-grid-activity">
          {activityPlaceholders.map((item) => (
            <article key={item.label} className="dashboard-placeholder-card activity">
              <div className="dashboard-placeholder-head">
                <span>{item.label}</span>
                {item.badge ? (
                  <small className={`dashboard-mini-badge ${item.tone ?? "neutral"}`}>{item.badge}</small>
                ) : null}
              </div>
              <strong>{item.value}</strong>
              <small>{item.helper}</small>
            </article>
          ))}
        </div>
      </DashboardSection>

      <DashboardSection
        title="Platform Health"
        description="Des statuts visuels et une separation plus nette des signaux techniques."
        eyebrow="Sante plateforme"
        stats={healthStats}
      >
        <div className="dashboard-placeholder-grid dashboard-placeholder-grid-health">
          {platformHealthPlaceholders.map((item) => (
            <article key={item.label} className={`dashboard-placeholder-card health ${item.tone ?? "neutral"}`}>
              <div className="dashboard-placeholder-head">
                <span>{item.label}</span>
                {item.badge ? (
                  <small className={`dashboard-mini-badge ${item.tone ?? "neutral"}`}>{item.badge}</small>
                ) : null}
              </div>
              <strong>{item.value}</strong>
              <small>{item.helper}</small>
            </article>
          ))}
        </div>
      </DashboardSection>

      <div className="panel panel-wide dashboard-section-panel dashboard-actions-panel">
        <div className="dashboard-section-header">
          <div>
            <span className="dashboard-section-eyebrow">Actions admin</span>
            <h2>Actions</h2>
            <p>Actions utiles, mieux alignees et plus explicites pour les operations de maintenance.</p>
          </div>
          <div className="dashboard-section-stats">
            <div className="dashboard-section-stat">
              <span>Etat</span>
              <strong>{isRebuildingStats ? "Verrouille" : "Disponible"}</strong>
            </div>
          </div>
        </div>

        <div className="dashboard-actions-shell">
          <div className="dashboard-actions-copy">
            <strong>Maintenance admin</strong>
            <p>Relire les donnees ou relancer le calcul global.</p>
          </div>

          <div className="dashboard-actions dashboard-actions-section">
            <button
              className="primary-button dashboard-primary-action"
              type="button"
              onClick={() => void refreshCounts()}
              disabled={isFetchingStats || isRebuildingStats}
            >
              {isFetchingStats ? "Chargement..." : "Rafraichir l affichage"}
            </button>
            <button
              className="secondary-button inline-secondary-button dashboard-secondary-action"
              type="button"
              onClick={() => void rebuildCounts()}
              disabled={isFetchingStats || isRebuildingStats}
            >
              {isRebuildingStats ? "Rebuild en cours..." : "Recalculer les stats globales"}
            </button>
          </div>
        </div>

        <p className="helper-text dashboard-actions-note">
          {isRebuildingStats
            ? "Le recalcul est en cours. Les actions sont temporairement verrouillees."
            : "Les actions conservent les memes sources de donnees et la meme logique de fetch."}
        </p>
      </div>
    </section>
  );
}
