"use client";

import type { Game } from "@/types/dashboard";

type GameCardProps = {
  game: Game;
  isTogglePending: boolean;
  isDuplicatePending: boolean;
  onToggle: (game: Game) => void;
  onEdit: (game: Game) => void;
  onDuplicate: (game: Game) => void;
};

function formatDate(value: string | null) {
  if (!value) {
    return "--/--/----";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--/--/----";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getProgress(game: Game) {
  const now = Date.now();

  if (!game.startDateValue || !game.endDateValue || game.endDateValue <= game.startDateValue) {
    return {
      progress: 0,
      tone: "neutral",
      helper: "Dates a verifier",
    } as const;
  }

  const duration = game.endDateValue - game.startDateValue;
  const elapsed = Math.min(Math.max(now - game.startDateValue, 0), duration);
  const progress = Math.round((elapsed / duration) * 100);
  const remainingRatio = Math.max((game.endDateValue - now) / duration, 0);
  const remainingDays = Math.max(
    0,
    Math.ceil((game.endDateValue - now) / (1000 * 60 * 60 * 24)),
  );

  if (now >= game.endDateValue) {
    return {
      progress: 100,
      tone: "red",
      helper: `Termine le ${formatDate(game.endDate)}`,
    } as const;
  }

  if (remainingRatio < 0.1) {
    return {
      progress,
      tone: "red",
      helper: `${progress}% ecoule · ${remainingDays}j restants`,
    } as const;
  }

  if (remainingRatio < 0.3) {
    return {
      progress,
      tone: "amber",
      helper: `${progress}% ecoule · ${remainingDays}j restants`,
    } as const;
  }

  return {
    progress,
    tone: "green",
    helper: `${progress}% ecoule · ${remainingDays}j restants`,
  } as const;
}

function getBadge(game: Game) {
  const now = Date.now();
  const endValue = game.endDateValue ?? 0;

  if (game.imageMissing) {
    return { label: "image manquante", tone: "missing" } as const;
  }

  if (game.status === "prive") {
    return { label: "prive", tone: "private" } as const;
  }

  if (game.status === "brouillon") {
    return { label: "brouillon", tone: "draft" } as const;
  }

  if (game.status === "expire" || (endValue > 0 && endValue < now)) {
    return { label: "expire", tone: "expired" } as const;
  }

  if (endValue > now) {
    const remainingDays = Math.ceil((endValue - now) / (1000 * 60 * 60 * 24));

    if (remainingDays <= 7) {
      return { label: `expire dans ${remainingDays}j`, tone: "soon" } as const;
    }
  }

  return { label: "actif", tone: "active" } as const;
}

function isSwitchOn(game: Game) {
  return game.status === "actif" || game.status === "prive";
}

export function GameCard({
  game,
  isTogglePending,
  isDuplicatePending,
  onToggle,
  onEdit,
  onDuplicate,
}: GameCardProps) {
  const badge = getBadge(game);
  const progress = getProgress(game);

  return (
    <article className={`game-manager-card ${game.imageMissing ? "missing-image" : ""}`}>
      <div className="game-manager-visual">
        {game.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="game-manager-thumb" src={game.imageUrl} alt={game.title} />
        ) : (
          <div className="game-manager-thumb placeholder">
            <span className="game-manager-missing-icon">×</span>
          </div>
        )}
      </div>

      <div className="game-manager-main">
        <div className="game-manager-topline">
          <div className="game-manager-copy">
            <h3>{game.title}</h3>
            <div className="game-manager-meta">
              <span>{game.merchantName}</span>
              <span>{`${formatDate(game.startDate)} → ${formatDate(game.endDate)}`}</span>
              <span>{`${new Intl.NumberFormat("fr-FR").format(game.sessionCount)} parties`}</span>
            </div>
          </div>

          <div className="game-manager-badges">
            <span className={`game-manager-badge ${badge.tone}`}>{badge.label}</span>
            {game.imageMissing ? <span className="game-manager-badge fixing">a corriger</span> : null}
          </div>
        </div>

        <div className="game-manager-progress-row">
          <div className="game-manager-progress-track" aria-hidden="true">
            <span
              className={`game-manager-progress-bar ${progress.tone}`}
              style={{ width: `${progress.progress}%` }}
            />
          </div>
          <p className="game-manager-progress-helper">
            {game.imageMissing ? "Bloque — image requise" : progress.helper}
          </p>
        </div>
      </div>

      <div className="game-manager-actions">
        <button
          type="button"
          className={`game-manager-switch ${isSwitchOn(game) ? "on" : "off"}`}
          onClick={() => onToggle(game)}
          disabled={isTogglePending}
          aria-pressed={isSwitchOn(game)}
          aria-label={isSwitchOn(game) ? "Desactiver le jeu" : "Activer le jeu"}
        >
          <span className="game-manager-switch-thumb" />
        </button>

        <button type="button" className="row-link-button secondary" onClick={() => onEdit(game)}>
          Modifier
        </button>

        <button
          type="button"
          className="row-link-button secondary"
          onClick={() => onDuplicate(game)}
          disabled={isDuplicatePending}
        >
          {isDuplicatePending ? "Duplication..." : "Dupliquer"}
        </button>
      </div>
    </article>
  );
}
