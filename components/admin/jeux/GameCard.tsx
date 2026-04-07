"use client";

import { buildPrizeSummary } from "@/components/admin/jeux/buildPrizeSummary";
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
      barClassName: "bg-[#E24B4A]",
      helper: "0% écoulé · dates à vérifier",
    };
  }

  const duration = game.endDateValue - game.startDateValue;
  const elapsed = Math.min(Math.max(now - game.startDateValue, 0), duration);
  const progress = Math.round((elapsed / duration) * 100);
  const remainingRatio = Math.max((game.endDateValue - now) / duration, 0);
  const remainingDays = Math.max(0, Math.ceil((game.endDateValue - now) / (1000 * 60 * 60 * 24)));

  if (now >= game.endDateValue) {
    return {
      progress: 100,
      barClassName: "bg-[#E24B4A]",
      helper: "100% écoulé · 0j restants",
    };
  }

  if (remainingRatio < 0.1) {
    return {
      progress,
      barClassName: "bg-[#E24B4A]",
      helper: `${progress}% écoulé · ${remainingDays}j restants`,
    };
  }

  if (remainingRatio < 0.3) {
    return {
      progress,
      barClassName: "bg-[#EF9F27]",
      helper: `${progress}% écoulé · ${remainingDays}j restants`,
    };
  }

  return {
    progress,
    barClassName: "bg-[#639922]",
    helper: `${progress}% écoulé · ${remainingDays}j restants`,
  };
}

function getBadge(game: Game) {
  const now = Date.now();
  const endValue = game.endDateValue ?? 0;

  if (game.imageMissing) {
    return {
      label: "image manquante",
      className: "bg-[#FCEBEB] text-[#A32D2D]",
    };
  }

  if (game.status === "prive") {
    return {
      label: "prive",
      className: "bg-[#E6F1FB] text-[#185FA5]",
    };
  }

  if (game.status === "brouillon") {
    return {
      label: "brouillon",
      className: "bg-[#FAEEDA] text-[#633806]",
    };
  }

  if (game.status === "expire" || (endValue > 0 && endValue < now)) {
    return {
      label: "expire",
      className: "bg-[#F1EFE8] text-[#5F5E5A]",
    };
  }

  if (endValue > now) {
    const remainingDays = Math.ceil((endValue - now) / (1000 * 60 * 60 * 24));

    if (remainingDays <= 7) {
      return {
        label: "expire bientôt",
        className: "bg-[#FAEEDA] text-[#633806]",
      };
    }
  }

  return {
    label: "actif",
    className: "bg-[#EAF3DE] text-[#3B6D11]",
  };
}

function isSwitchOn(game: Game) {
  return game.status === "actif" || game.status === "prive";
}

const actionButtonClassName =
  "rounded-[8px] border border-[color:var(--color-border-tertiary,rgba(0,0,0,0.08))] bg-[var(--color-background-primary,#fff)] px-3 py-2 text-[11px] font-medium text-[var(--color-text-primary,#171717)] transition hover:bg-[rgba(0,0,0,0.02)] disabled:cursor-not-allowed disabled:opacity-60";

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
  const prizeSummary = buildPrizeSummary(game);
  const mainPrizeBadgeClassName =
    prizeSummary.mainPrizeState === "named"
      ? "border border-[#B6D7F2] bg-[#EAF4FD] text-[#185FA5]"
      : "border border-[#F0D8A8] bg-[#FFF6E8] text-[#8C6115]";

  return (
    <article
      className={`grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border border-[color:var(--color-border-tertiary,rgba(0,0,0,0.08))] bg-[var(--color-background-primary,#fff)] px-4 py-3 ${
        game.imageMissing ? "rounded-l-none border-l-2 border-l-[#E24B4A]" : ""
      }`}
    >
      <div className="flex h-12 w-12 items-center justify-center">
        {game.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="h-12 w-12 rounded-[8px] object-cover" src={game.imageUrl} alt={game.title} />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-[8px] border border-[#F09595] bg-[#FCEBEB] text-[22px] leading-none text-[#E24B4A]">
            x
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-[14px] font-medium text-[var(--color-text-primary,#171717)]">
            {game.title}
          </h3>
          <span className={`rounded-full px-2 py-1 text-[10.5px] font-medium leading-none ${badge.className}`}>
            {badge.label}
          </span>
        </div>

        <p className="mt-1 truncate text-[11px] text-[var(--color-text-secondary,#7b7b7b)]">
          {`${game.merchantName} · ${formatDate(game.startDate)} · ${formatDate(game.endDate)} · ${new Intl.NumberFormat(
            "fr-FR",
          ).format(game.sessionCount)} parties`}
        </p>

        <div className="mt-3 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
          {prizeSummary.hasMainPrize ? (
            <span className={`rounded-full px-2 py-1 text-[10.5px] font-medium leading-none ${mainPrizeBadgeClassName}`}>
              {`Lot principal : ${prizeSummary.mainPrizeLabel}`}
            </span>
          ) : null}

          {prizeSummary.secondaryCount > 0 ? (
            <span className="rounded-full border border-[rgba(15,23,42,0.08)] bg-[rgba(15,23,42,0.04)] px-2 py-1 text-[10.5px] font-medium leading-none text-[var(--color-text-secondary,#5b6472)]">
                {prizeSummary.secondaryCountLabel}
              </span>
          ) : null}

          {prizeSummary.isEmpty ? (
            <span className="rounded-full border border-[#F2D49A] bg-[#FFF5DF] px-2 py-1 text-[10.5px] font-medium leading-none text-[#9A6508]">
              Aucun lot renseigné
            </span>
          ) : null}
          </div>

          {prizeSummary.secondaryPreview ? (
            <div
              className="max-w-[360px] truncate pl-1 text-[10.5px] leading-[1.35] text-[var(--color-text-secondary,#7b7b7b)]"
              title={prizeSummary.secondaryTooltip ?? undefined}
            >
              {`Secondaires : ${prizeSummary.secondaryPreview}`}
            </div>
          ) : null}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div className="h-[3px] w-full max-w-[280px] overflow-hidden rounded-full bg-[rgba(0,0,0,0.08)]">
            <div className={`h-full rounded-full ${progress.barClassName}`} style={{ width: `${progress.progress}%` }} />
          </div>
          <span className="whitespace-nowrap text-[11px] text-[var(--color-text-tertiary,#9a9a9a)]">
            {progress.helper}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`relative h-[18px] w-8 rounded-full transition ${
            isSwitchOn(game) ? "bg-[#639922]" : "bg-[rgba(17,24,39,0.18)]"
          }`}
          onClick={() => onToggle(game)}
          disabled={isTogglePending}
          aria-pressed={isSwitchOn(game)}
          aria-label={isSwitchOn(game) ? "Desactiver le jeu" : "Activer le jeu"}
        >
          <span
            className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition ${
              isSwitchOn(game) ? "left-[16px]" : "left-[2px]"
            }`}
          />
        </button>

        <button type="button" className={actionButtonClassName} onClick={() => onEdit(game)}>
          Modifier
        </button>

        <button
          type="button"
          className={actionButtonClassName}
          onClick={() => onDuplicate(game)}
          disabled={isDuplicatePending}
        >
          {isDuplicatePending ? "Duplication..." : "Dupliquer"}
        </button>
      </div>
    </article>
  );
}
