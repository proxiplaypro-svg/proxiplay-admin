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
  "rounded-[8px] border border-[#E8E8E4] bg-white px-3 py-2 text-[11px] font-medium text-[#1A1A1A] transition hover:bg-[#FAFAF8] disabled:cursor-not-allowed disabled:opacity-60";

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

  const sessionCountFormatted = new Intl.NumberFormat("fr-FR").format(game.sessionCount);

  return (
    <article
      className={`grid grid-cols-[48px_minmax(0,1fr)] items-start gap-3 rounded-[12px] border border-[#E8E8E4] bg-white px-4 py-3 sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:items-center ${
        game.imageMissing ? "rounded-l-none border-l-2 border-l-[#E24B4A]" : ""
      }`}
    >
      {/* Colonne image */}
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

      {/* Colonne centrale */}
      <div className="min-w-0">
        {/* Titre + badge statut */}
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-[14px] font-medium text-[#1A1A1A]">
            {game.title}
          </h3>
          <span className={`rounded-full px-2 py-1 text-[10.5px] font-medium leading-none ${badge.className}`}>
            {badge.label}
          </span>
        </div>

        {/* Ligne meta : marchand · dates — sans parties (affichées séparément sur mobile) */}
        <p className="mt-1 truncate text-[11px] text-[#666666]">
          {`${game.merchantName} · ${formatDate(game.startDate)} · ${formatDate(game.endDate)}`}
          {/* Parties visibles uniquement sur desktop dans cette ligne */}
          <span className="hidden sm:inline">{` · ${sessionCountFormatted} parties`}</span>
        </p>

        {/* Badges lots */}
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {prizeSummary.hasMainPrize ? (
              <span className={`rounded-full px-2 py-1 text-[10.5px] font-medium leading-none ${mainPrizeBadgeClassName}`}>
                {`Lot principal : ${prizeSummary.mainPrizeLabel}`}
              </span>
            ) : null}

            {prizeSummary.secondaryCount > 0 ? (
              <span className="rounded-full border border-[#E8E8E4] bg-[#F7F7F5] px-2 py-1 text-[10.5px] font-medium leading-none text-[#666666]">
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
              className="max-w-[360px] truncate pl-1 text-[10.5px] leading-[1.35] text-[#666666]"
              title={prizeSummary.secondaryTooltip ?? undefined}
            >
              {`Secondaires : ${prizeSummary.secondaryPreview}`}
            </div>
          ) : null}
        </div>

        {/* Parties jouées — mobile uniquement, bien visible */}
        <p className="mt-2 text-[13px] font-semibold text-[#1A1A1A] sm:hidden">
          {sessionCountFormatted} parties jouées
        </p>

        {/* Barre de progression */}
        <div className="mt-2 flex items-center gap-2">
          <div className="h-[3px] w-full max-w-[280px] overflow-hidden rounded-full bg-[#E8E8E4]">
            <div className={`h-full rounded-full ${progress.barClassName}`} style={{ width: `${progress.progress}%` }} />
          </div>
          <span className="whitespace-nowrap text-[11px] text-[#999999]">
            {progress.helper}
          </span>
        </div>

        {/* Boutons — mobile uniquement */}
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:hidden">
          <button
            type="button"
            className={`relative h-[18px] w-8 rounded-full transition ${
              isSwitchOn(game) ? "bg-[#639922]" : "bg-[#D7D7D1]"
            }`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(game);
            }}
            disabled={isTogglePending}
            aria-pressed={isSwitchOn(game)}
            aria-label="Activer ou désactiver la visibilité du jeu dans l'app"
          >
            <span
              className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition ${
                isSwitchOn(game) ? "left-[16px]" : "left-[2px]"
              }`}
            />
          </button>

          <button
            type="button"
            className={actionButtonClassName}
            onClick={(event) => {
              event.stopPropagation();
              onEdit(game);
            }}
          >
            Modifier
          </button>

          <button
            type="button"
            className={actionButtonClassName}
            onClick={(event) => {
              event.stopPropagation();
              onDuplicate(game);
            }}
            disabled={isDuplicatePending}
          >
            {isDuplicatePending ? "Duplication..." : "Dupliquer"}
          </button>
        </div>
      </div>

      {/* 3e colonne — desktop uniquement */}
      <div className="hidden items-center gap-2 sm:flex">
        <div className="relative group flex items-center">
          <button
            type="button"
            className={`relative h-[18px] w-8 rounded-full transition ${
              isSwitchOn(game) ? "bg-[#639922]" : "bg-[#D7D7D1]"
            }`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(game);
            }}
            disabled={isTogglePending}
            title="Activer ou désactiver la visibilité du jeu dans l'app"
            aria-pressed={isSwitchOn(game)}
            aria-label="Activer ou désactiver la visibilité du jeu dans l'app"
          >
            <span
              className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition ${
                isSwitchOn(game) ? "left-[16px]" : "left-[2px]"
              }`}
            />
          </button>
          <div className="absolute right-full mr-2 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-[6px] bg-[#1A1A1A] px-2 py-1 text-[11px] text-white pointer-events-none z-10 group-hover:block">
            {game.status === "actif" || game.status === "prive"
              ? "Désactiver (passer en brouillon)"
              : "Activer (rendre visible)"}
          </div>
        </div>

        <button
          type="button"
          className={actionButtonClassName}
          onClick={(event) => {
            event.stopPropagation();
            onEdit(game);
          }}
        >
          Modifier
        </button>

        <button
          type="button"
          className={actionButtonClassName}
          onClick={(event) => {
            event.stopPropagation();
            onDuplicate(game);
          }}
          disabled={isDuplicatePending}
        >
          {isDuplicatePending ? "Duplication..." : "Dupliquer"}
        </button>
      </div>
    </article>
  );
}
