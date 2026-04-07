"use client";

import type { MerchantPilotageItem } from "@/types/dashboard";

type MerchantCardProps = {
  merchant: MerchantPilotageItem;
  selected: boolean;
  onSelect: (merchantId: string) => void;
};

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function getScoreTone(score: number) {
  if (score < 30) {
    return {
      bar: "#E24B4A",
      halo: "rgba(226,75,74,0.18)",
      avatarBg: "rgba(226,75,74,0.14)",
      avatarText: "#F6B2B1",
    };
  }

  if (score <= 60) {
    return {
      bar: "#EF9F27",
      halo: "rgba(239,159,39,0.18)",
      avatarBg: "rgba(239,159,39,0.14)",
      avatarText: "#FFD899",
    };
  }

  return {
    bar: "#639922",
    halo: "rgba(99,153,34,0.18)",
    avatarBg: "rgba(99,153,34,0.14)",
    avatarText: "#D6F0B6",
  };
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

export function MerchantCard({ merchant, selected, onSelect }: MerchantCardProps) {
  const tone = getScoreTone(merchant.engagementScore);
  const statusUi = getStatusUi(merchant.status);

  return (
    <button
      type="button"
      onClick={() => onSelect(merchant.id)}
      className={`w-full rounded-[26px] border bg-[rgba(255,255,255,0.04)] p-5 text-left transition ${
        selected
          ? "border-[#639922] shadow-[0_0_0_1px_rgba(99,153,34,0.28)]"
          : "border-[rgba(159,177,199,0.08)] hover:border-[rgba(99,153,34,0.22)] hover:bg-[rgba(255,255,255,0.05)]"
      }`}
    >
      <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-start gap-4">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full text-[1.55rem] font-semibold"
          style={{ backgroundColor: tone.avatarBg, color: tone.avatarText }}
        >
          {merchant.initials}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <strong className="block truncate text-[1.05rem] text-[var(--foreground)]">
                {merchant.name}
              </strong>
              <p className="mt-2 text-[0.95rem] text-[var(--muted)]">
                {merchant.city || "Ville non renseignee"}{" "}
                <span className="mx-1 text-[rgba(159,177,199,0.42)]">·</span>
                {merchant.gamesActiveCount} jeu{merchant.gamesActiveCount > 1 ? "x" : ""} actif
                {merchant.gamesActiveCount > 1 ? "s" : ""}
                <span className="mx-1 text-[rgba(159,177,199,0.42)]">·</span>
                {formatCount(merchant.participationsJ30)} participations J30
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <div className="flex items-center gap-3">
              <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{
                    width: `${merchant.engagementScore}%`,
                    backgroundColor: tone.bar,
                    boxShadow: `0 0 16px ${tone.halo}`,
                  }}
                />
              </div>
              <span className="min-w-[78px] text-[0.95rem] font-medium text-[var(--foreground)]">
                Score {merchant.engagementScore}
              </span>
            </div>
          </div>
        </div>

        <div className="grid justify-items-end gap-3 text-right">
          <span className={`inline-flex rounded-full px-3 py-1 text-[0.86rem] font-medium ${statusUi.className}`}>
            {statusUi.label}
          </span>
          <div className="text-[0.88rem] leading-[1.45] text-[var(--muted)]">
            <div>Derniere relance</div>
            <div className="mt-1 text-[var(--foreground)]">{merchant.lastContactDateLabel}</div>
          </div>
        </div>
      </div>
    </button>
  );
}
