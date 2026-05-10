"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type {
  MerchantActiveGameSummary,
  MerchantPilotageItem,
  MerchantRelanceHistoryItem,
} from "@/types/dashboard";

type MerchantPanelProps = {
  merchant: MerchantPilotageItem | null;
  whatsappHref: string | null;
  emailHref: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onOpenExternal: (href: string, target?: "_blank" | "_self") => void;
};

function getScoreTone(score: number) {
  if (score < 30) {
    return { bar: "#E24B4A", label: "#A32D2D" };
  }

  if (score <= 60) {
    return { bar: "#EF9F27", label: "#633806" };
  }

  return { bar: "#639922", label: "#3B6D11" };
}

function getStatusUi(status: MerchantPilotageItem["status"]) {
  switch (status) {
    case "actif":
      return { label: "actif", className: "border-[#CFE5AF] bg-[#EAF3DE] text-[#3B6D11]" };
    case "a_relancer":
      return { label: "a relancer", className: "border-[#F3D8A6] bg-[#FAEEDA] text-[#633806]" };
    default:
      return { label: "inactif", className: "border-[#F1D1D1] bg-[#FCEBEB] text-[#A32D2D]" };
  }
}

function getHistoryDotColor(channel: MerchantRelanceHistoryItem["channel"]) {
  switch (channel) {
    case "email":
      return "#639922";
    case "whatsapp":
      return "#25D366";
    default:
      return "#B7B5AC";
  }
}

function getGameBadge(game: MerchantActiveGameSummary) {
  switch (game.status) {
    case "actif":
      return { label: "actif", className: "border-[#CFE5AF] bg-[#EAF3DE] text-[#3B6D11]" };
    case "expire_bientot":
      return { label: "expire bientot", className: "border-[#F3D8A6] bg-[#FAEEDA] text-[#633806]" };
    case "brouillon":
      return { label: "brouillon", className: "border-[#E8E8E4] bg-[#F7F7F5] text-[#666]" };
    default:
      return { label: "expire", className: "border-[#F1D1D1] bg-[#FCEBEB] text-[#A32D2D]" };
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
    <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#F7F7F5] text-[1.1rem]">
      ◈
    </div>
  );
}

function PanelSection({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`rounded-[12px] border border-[#E8E8E4] bg-white p-6 ${className}`}>{children}</section>;
}

export function MerchantPanel({
  merchant,
  whatsappHref,
  emailHref,
  onEdit,
  onDelete,
  onOpenExternal,
}: MerchantPanelProps) {
  if (!merchant) {
    return (
      <aside className="sticky top-0">
        <PanelSection>
          <strong className="block text-[1.05rem] text-[#1a1a1a]">Aucun marchand selectionne</strong>
          <p className="mt-3 text-[0.95rem] leading-[1.6] text-[#666]">
            Selectionne une enseigne dans la liste pour afficher son score, ses jeux actifs et son historique de relance.
          </p>
        </PanelSection>
      </aside>
    );
  }

  const tone = getScoreTone(merchant.engagementScore);
  const statusUi = getStatusUi(merchant.status);
  const displayedGames = merchant.activeGames.slice(0, 3);
  const lastContactLabel =
    merchant.lastContactDateValue > 0 ? merchant.lastContactDateLabel : "Non renseigne";

  return (
    <aside className="sticky top-0 grid max-h-screen gap-4 overflow-y-auto pb-6">
      <PanelSection>
        <div className="flex items-start gap-4">
          {merchant.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={merchant.imageUrl}
              alt={merchant.name}
              className="h-16 w-16 rounded-[10px] border border-[#E8E8E4] object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EAF3DE] text-[1.05rem] font-semibold text-[#3B6D11]">
              {merchant.initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="m-0 truncate text-[1.45rem] text-[#1a1a1a]">{merchant.name}</h3>
              <span className={`inline-flex rounded-full border px-3 py-1 text-[0.84rem] font-medium ${statusUi.className}`}>
                {statusUi.label}
              </span>
            </div>
            <p className="mt-2 break-words text-[0.95rem] leading-[1.65] text-[#666]">
              {[merchant.city || "Ville non renseignee", merchant.email || "Email non renseigne", merchant.phone || "Telephone non renseigne"].join(" · ")}
            </p>
            <p className="mt-2 text-[12px]" style={{ color: merchant.lastContactDateValue > 0 ? "#666" : "#999" }}>
              Derniere relance : {lastContactLabel}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.84rem] uppercase tracking-[0.08em] text-[#999]">Score d engagement</span>
            <strong className="text-[1.05rem]" style={{ color: tone.label }}>
              {merchant.engagementScore}/100
            </strong>
          </div>
          <div className="mt-3 h-[6px] overflow-hidden rounded-full bg-[#E8E8E4]">
            <div className="h-full rounded-full" style={{ width: `${merchant.engagementScore}%`, backgroundColor: tone.bar }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[0.84rem] text-[#999]">
            <span>Inactif</span>
            <span>Excellent</span>
          </div>
          <p className="mt-2 text-[12px] text-[#666]">
            <strong>Boutique :</strong> {merchant.address || "Adresse non renseignee"} · {merchant.city}
          </p>
          {(merchant.ownerFirstName || merchant.ownerLastName) && (
            <div className="mt-3 rounded-[8px] bg-[#F7F7F5] px-3 py-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999]">Gerant</p>
              <p className="mt-1 text-[13px] font-medium text-[#1a1a1a]">
                {[merchant.ownerFirstName, merchant.ownerLastName].filter(Boolean).join(" ")}
              </p>
              <p className="mt-1 text-[12px] text-[#666]">
                {merchant.ownerEmail || "Email non renseigne"} · {merchant.ownerPhone || "Tel non renseigne"}
              </p>
              {merchant.ownerStatus && (
                <p className="mt-1 text-[11px] text-[#999]">Statut compte : {merchant.ownerStatus}</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link
            href={`/admin/games?merchantId=${merchant.id}`}
            className="flex min-h-[54px] items-center justify-center rounded-[10px] border border-[#CFE5AF] bg-[#EAF3DE] px-4 text-center text-[1rem] font-medium text-[#3B6D11] transition hover:bg-[#E2F0D0]"
          >
            Voir les jeux →
          </Link>
          <button
            type="button"
            onClick={onEdit}
            className="flex min-h-[54px] items-center justify-center rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] px-4 text-center text-[1rem] font-medium text-[#1a1a1a] transition hover:border-[#D9D9D4] hover:bg-[#FAFAF8]"
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
            className="flex min-h-[54px] items-center justify-center rounded-[10px] border px-4 text-center text-[1rem] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
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
            className="flex min-h-[54px] items-center justify-center rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] px-4 text-center text-[1rem] font-medium text-[#1a1a1a] transition hover:border-[#D9D9D4] hover:bg-[#FAFAF8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Email relance
          </button>
          <Link
            href={`/admin/commercants/${merchant.id}`}
            className="col-span-2 flex min-h-[44px] items-center justify-center rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] px-4 text-[0.9rem] font-medium text-[#1a1a1a] transition hover:border-[#C0DD97] hover:bg-[#EAF3DE] hover:text-[#3B6D11]"
          >
            Voir la fiche complète →
          </Link>
          <button
            type="button"
            onClick={onDelete}
            className="col-span-2 flex min-h-[44px] items-center justify-center rounded-[10px] border border-[#F09595] bg-white px-4 text-[0.9rem] font-medium text-[#A32D2D] transition hover:bg-[#FCEBEB]"
          >
            Supprimer ce marchand
          </button>
        </div>
      </PanelSection>

      <PanelSection>
        <span className="text-[0.84rem] uppercase tracking-[0.08em] text-[#999]">Statistiques</span>
        <div className="mt-5 grid gap-4">
          {[
            ["Parties jouees", merchant.participationsJ30],
            ["Vues du jeu", merchant.clicksJ30],
            ["Jeux actifs", merchant.gamesActiveCount],
            ["Gains remis", merchant.gainsRemis],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 text-[1rem]">
              <span className="text-[#666]">{label}</span>
              <strong className="text-[#1a1a1a]">{value}</strong>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection>
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-[0.84rem] uppercase tracking-[0.08em] text-[#999]">Jeux en cours</span>
            <p className="mt-2 text-[0.95rem] text-[#666]">
              {merchant.gamesActiveCount > 0
                ? `${merchant.gamesActiveCount} jeu${merchant.gamesActiveCount > 1 ? "x" : ""} actif${merchant.gamesActiveCount > 1 ? "s" : ""}`
                : "Aucun jeu actif pour le moment"}
            </p>
          </div>
          <Link href={`/admin/games?merchantId=${merchant.id}`} className="text-[0.92rem] font-medium text-[#639922]">
            Voir tous →
          </Link>
        </div>

        {displayedGames.length === 0 ? (
          <p className="mt-5 text-[0.95rem] leading-[1.6] text-[#666]">
            Aucun jeu actif a afficher sur ce marchand.
          </p>
        ) : (
          <div className="mt-5 grid gap-3">
            {displayedGames.map((game) => {
              const badge = getGameBadge(game);

              return (
                <div
                  key={game.id}
                  className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] border border-[#E8E8E4] bg-[#FCFCFB] p-3"
                >
                  {renderGameThumb(game)}
                  <div className="min-w-0">
                    <strong className="block truncate text-[1rem] text-[#1a1a1a]">{game.name}</strong>
                    <p className="mt-1 truncate text-[0.9rem] text-[#666]">
                      {game.expiryLabel} · {game.participationsLabel}
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-[0.82rem] font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </PanelSection>

      <PanelSection>
        <span className="text-[0.84rem] uppercase tracking-[0.08em] text-[#999]">Historique des relances</span>

        {merchant.relanceHistory.length === 0 ? (
          <p className="mt-5 text-[0.95rem] leading-[1.6] text-[#666]">
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
                <div className="min-w-0 border-b border-[#F0F0EC] pb-4 last:border-b-0 last:pb-0">
                  <strong className="block text-[1rem] text-[#1a1a1a]">{entry.label}</strong>
                  <p className="mt-1 text-[0.9rem] text-[#999]">{entry.timestampLabel}</p>
                  {entry.note ? <p className="mt-2 text-[0.9rem] leading-[1.5] text-[#666]">{entry.note}</p> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </PanelSection>
    </aside>
  );
}
