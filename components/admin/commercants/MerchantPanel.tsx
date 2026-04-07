"use client";

import Link from "next/link";
import type { MerchantActiveGameSummary, MerchantPilotageItem, MerchantRelanceHistoryItem } from "@/types/dashboard";

type MerchantPanelProps = {
  merchant: MerchantPilotageItem | null;
  whatsappHref: string | null;
  emailHref: string | null;
  onEdit: () => void;
  onOpenExternal: (href: string, target?: "_blank" | "_self") => void;
};

function getScoreTone(score: number) {
  if (score < 30) {
    return { bar: "#E24B4A", label: "#F7B2B1" };
  }

  if (score <= 60) {
    return { bar: "#EF9F27", label: "#FFD899" };
  }

  return { bar: "#639922", label: "#D6F0B6" };
}

function getStatusUi(status: MerchantPilotageItem["status"]) {
  switch (status) {
    case "actif":
      return {
        label: "actif",
        className: "border border-[rgba(143,227,168,0.24)] bg-[rgba(143,227,168,0.12)] text-[var(--success)]",
      };
    case "a_relancer":
      return {
        label: "a relancer",
        className: "border border-[rgba(255,214,123,0.24)] bg-[rgba(255,214,123,0.12)] text-[var(--warning)]",
      };
    default:
      return {
        label: "inactif",
        className: "border border-[rgba(255,142,142,0.24)] bg-[rgba(255,142,142,0.12)] text-[var(--danger)]",
      };
  }
}

function getHistoryDotColor(channel: MerchantRelanceHistoryItem["channel"]) {
  switch (channel) {
    case "email":
      return "#639922";
    case "whatsapp":
      return "#25D366";
    default:
      return "rgba(159,177,199,0.8)";
  }
}

function getGameBadge(game: MerchantActiveGameSummary) {
  switch (game.status) {
    case "actif":
      return {
        label: "actif",
        className: "border border-[rgba(143,227,168,0.24)] bg-[rgba(143,227,168,0.12)] text-[var(--success)]",
      };
    case "expire_bientot":
      return {
        label: "expire bientot",
        className: "border border-[rgba(255,214,123,0.24)] bg-[rgba(255,214,123,0.12)] text-[var(--warning)]",
      };
    case "brouillon":
      return {
        label: "brouillon",
        className: "border border-[rgba(159,177,199,0.16)] bg-[rgba(255,255,255,0.04)] text-[var(--muted)]",
      };
    default:
      return {
        label: "expire",
        className: "border border-[rgba(255,142,142,0.24)] bg-[rgba(255,142,142,0.12)] text-[var(--danger)]",
      };
  }
}

function renderGameThumb(game: MerchantActiveGameSummary) {
  if (game.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={game.imageUrl} alt={game.name} className="h-12 w-12 rounded-[14px] object-cover" />
    );
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[rgba(255,255,255,0.06)] text-[1.1rem]">
      🎯
    </div>
  );
}

export function MerchantPanel({
  merchant,
  whatsappHref,
  emailHref,
  onEdit,
  onOpenExternal,
}: MerchantPanelProps) {
  if (!merchant) {
    return (
      <aside className="sticky top-0 rounded-[28px] border border-[rgba(159,177,199,0.08)] bg-[rgba(255,255,255,0.04)] p-6">
        <strong className="block text-[1.05rem]">Aucun marchand selectionne</strong>
        <p className="mt-3 text-[0.95rem] leading-[1.6] text-[var(--muted)]">
          Selectionne une enseigne dans la liste pour afficher son score, ses jeux actifs et son historique de relance.
        </p>
      </aside>
    );
  }

  const tone = getScoreTone(merchant.engagementScore);
  const statusUi = getStatusUi(merchant.status);
  const displayedGames = merchant.activeGames.slice(0, 3);

  return (
    <aside className="sticky top-0 grid gap-4">
      <section className="rounded-[28px] border border-[rgba(159,177,199,0.08)] bg-[rgba(255,255,255,0.04)] p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(99,153,34,0.14)] text-[1.05rem] font-semibold text-[#D6F0B6]">
            {merchant.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="m-0 truncate text-[1.45rem] text-[var(--foreground)]">{merchant.name}</h3>
              <span className={`inline-flex rounded-full px-3 py-1 text-[0.84rem] font-medium ${statusUi.className}`}>
                {statusUi.label}
              </span>
            </div>
            <p className="mt-2 break-words text-[0.95rem] leading-[1.65] text-[var(--muted)]">
              {[merchant.city || "Ville non renseignee", merchant.email || "Email non renseigne", merchant.phone || "Telephone non renseigne"].join(" · ")}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.84rem] uppercase tracking-[0.08em] text-[var(--muted)]">Score d engagement</span>
            <strong className="text-[1.05rem]" style={{ color: tone.label }}>
              {merchant.engagementScore}/100
            </strong>
          </div>
          <div className="mt-3 h-[6px] overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
            <div className="h-full rounded-full" style={{ width: `${merchant.engagementScore}%`, backgroundColor: tone.bar }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[0.84rem] text-[var(--muted)]">
            <span>Inactif</span>
            <span>Excellent</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link
            href={`/admin/games/new?merchantId=${merchant.id}`}
            className="flex min-h-[54px] items-center justify-center rounded-[18px] border border-[rgba(99,153,34,0.28)] bg-[rgba(99,153,34,0.14)] px-4 text-center text-[1rem] font-medium text-[var(--foreground)] transition hover:bg-[rgba(99,153,34,0.18)]"
          >
            + Creer un jeu
          </Link>
          <button
            type="button"
            onClick={onEdit}
            className="flex min-h-[54px] items-center justify-center rounded-[18px] border border-[rgba(159,177,199,0.12)] bg-[rgba(255,255,255,0.03)] px-4 text-center text-[1rem] font-medium text-[var(--foreground)] transition hover:border-[rgba(159,177,199,0.18)] hover:bg-[rgba(255,255,255,0.05)]"
          >
            Modifier fiche
          </button>
          <button
            type="button"
            onClick={() => {
              if (whatsappHref) {
                onOpenExternal(whatsappHref, "_blank");
              }
            }}
            disabled={!whatsappHref}
            className="flex min-h-[54px] items-center justify-center rounded-[18px] border px-4 text-center text-[1rem] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: "#25D366", borderColor: "rgba(37,211,102,0.3)" }}
          >
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => {
              if (emailHref) {
                onOpenExternal(emailHref, "_self");
              }
            }}
            disabled={!emailHref}
            className="flex min-h-[54px] items-center justify-center rounded-[18px] border border-[rgba(159,177,199,0.12)] bg-[rgba(255,255,255,0.03)] px-4 text-center text-[1rem] font-medium text-[var(--foreground)] transition hover:border-[rgba(159,177,199,0.18)] hover:bg-[rgba(255,255,255,0.05)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Email relance
          </button>
        </div>
      </section>

      <section className="rounded-[28px] border border-[rgba(159,177,199,0.08)] bg-[rgba(255,255,255,0.04)] p-6">
        <span className="text-[0.84rem] uppercase tracking-[0.08em] text-[var(--muted)]">Stats J30</span>
        <div className="mt-5 grid gap-4">
          {[
            ["Participations", merchant.participationsJ30],
            ["Clics sur offres", merchant.clicksJ30],
            ["Jeux actifs", merchant.gamesActiveCount],
            ["Gains remis", merchant.gainsRemis],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 text-[1rem]">
              <span className="text-[var(--muted)]">{label}</span>
              <strong className="text-[var(--foreground)]">{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-[rgba(159,177,199,0.08)] bg-[rgba(255,255,255,0.04)] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-[0.84rem] uppercase tracking-[0.08em] text-[var(--muted)]">Jeux en cours</span>
            <p className="mt-2 text-[0.95rem] text-[var(--muted)]">
              {merchant.gamesActiveCount > 0
                ? `${merchant.gamesActiveCount} jeu${merchant.gamesActiveCount > 1 ? "x" : ""} actif${merchant.gamesActiveCount > 1 ? "s" : ""}`
                : "Aucun jeu actif pour le moment"}
            </p>
          </div>
          <Link href={`/admin/commercants/${merchant.id}`} className="text-[0.92rem] font-medium text-[#BFD0FF]">
            Voir tous →
          </Link>
        </div>

        {displayedGames.length === 0 ? (
          <p className="mt-5 text-[0.95rem] leading-[1.6] text-[var(--muted)]">
            Aucun jeu actif a afficher sur ce marchand.
          </p>
        ) : (
          <div className="mt-5 grid gap-3">
            {displayedGames.map((game) => {
              const badge = getGameBadge(game);

              return (
                <div
                  key={game.id}
                  className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] border border-[rgba(159,177,199,0.08)] bg-[rgba(255,255,255,0.03)] p-3"
                >
                  {renderGameThumb(game)}
                  <div className="min-w-0">
                    <strong className="block truncate text-[1rem] text-[var(--foreground)]">{game.name}</strong>
                    <p className="mt-1 truncate text-[0.9rem] text-[var(--muted)]">
                      {game.expiryLabel} · {game.participationsLabel}
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-[0.82rem] font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-[rgba(159,177,199,0.08)] bg-[rgba(255,255,255,0.04)] p-6">
        <span className="text-[0.84rem] uppercase tracking-[0.08em] text-[var(--muted)]">Historique des relances</span>

        {merchant.relanceHistory.length === 0 ? (
          <p className="mt-5 text-[0.95rem] leading-[1.6] text-[var(--muted)]">
            Historique indisponible pour ce marchand.
            <br />
            TODO: brancher une source relances normalisee si necessaire.
          </p>
        ) : (
          <div className="mt-5 grid gap-4">
            {merchant.relanceHistory.map((entry) => (
              <div key={entry.id} className="grid grid-cols-[12px_minmax(0,1fr)] gap-3">
                <span
                  className="mt-[6px] h-3 w-3 rounded-full"
                  style={{ backgroundColor: getHistoryDotColor(entry.channel) }}
                  aria-hidden="true"
                />
                <div className="min-w-0 border-b border-[rgba(159,177,199,0.08)] pb-4 last:border-b-0 last:pb-0">
                  <strong className="block text-[1rem] text-[var(--foreground)]">{entry.label}</strong>
                  <p className="mt-1 text-[0.9rem] text-[var(--muted)]">{entry.timestampLabel}</p>
                  {entry.note ? <p className="mt-2 text-[0.9rem] leading-[1.5] text-[var(--muted)]">{entry.note}</p> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
