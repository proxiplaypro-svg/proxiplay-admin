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
      avatarBg: "#FCEBEB",
      avatarText: "#A32D2D",
    };
  }

  if (score <= 60) {
    return {
      bar: "#EF9F27",
      halo: "rgba(239,159,39,0.18)",
      avatarBg: "#FAEEDA",
      avatarText: "#633806",
    };
  }

  return {
    bar: "#639922",
    halo: "rgba(99,153,34,0.18)",
    avatarBg: "#EAF3DE",
    avatarText: "#3B6D11",
  };
}

function getStatusUi(status: MerchantPilotageItem["status"]) {
  switch (status) {
    case "actif":
      return {
        label: "actif",
        className: "border border-[#CFE5AF] bg-[#EAF3DE] text-[#3B6D11]",
      };
    case "a_relancer":
      return {
        label: "a relancer",
        className: "border border-[#F3D8A6] bg-[#FAEEDA] text-[#633806]",
      };
    default:
      return {
        label: "inactif",
        className: "border border-[#F1D1D1] bg-[#FCEBEB] text-[#A32D2D]",
      };
  }
}

export function MerchantCard({ merchant, selected, onSelect }: MerchantCardProps) {
  const tone = getScoreTone(merchant.engagementScore);
  const statusUi = getStatusUi(merchant.status);
  const lastContactLabel =
    merchant.lastContactDateValue > 0 ? merchant.lastContactDateLabel : "Non renseigne";

  return (
    <button
      type="button"
      onClick={() => onSelect(merchant.id)}
      className={`w-full rounded-[12px] border bg-white p-5 text-left transition ${
        selected
          ? "border-[#639922] shadow-[0_0_0_1px_rgba(99,153,34,0.12)]"
          : "border-[#E8E8E4] hover:border-[#C0DD97] hover:bg-[#FAFAF8]"
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
              <strong className="block truncate text-[1.05rem] text-[#1a1a1a]">
                {merchant.name}
              </strong>
              <p className="mt-2 text-[0.95rem] text-[#666]">
                {merchant.city || "Ville non renseignee"}{" "}
                <span className="mx-1 text-[#D2D0C8]">·</span>
                {merchant.gamesActiveCount} jeu{merchant.gamesActiveCount > 1 ? "x" : ""} actif
                {merchant.gamesActiveCount > 1 ? "s" : ""}
                <span className="mx-1 text-[#D2D0C8]">·</span>
                {formatCount(merchant.participationsJ30)} participations J30
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <div className="flex items-center gap-3">
              <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-[#E8E8E4]">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{
                    width: `${merchant.engagementScore}%`,
                    backgroundColor: tone.bar,
                    boxShadow: `0 0 16px ${tone.halo}`,
                  }}
                />
              </div>
              <span className="min-w-[78px] text-[0.95rem] font-medium text-[#1a1a1a]">
                Score {merchant.engagementScore}
              </span>
            </div>
          </div>
        </div>

        <div className="grid justify-items-end gap-3 text-right">
          <span className={`inline-flex rounded-full px-3 py-1 text-[0.86rem] font-medium ${statusUi.className}`}>
            {statusUi.label}
          </span>
          <div className="text-[0.88rem] leading-[1.45] text-[#666]">
            <div>Derniere relance</div>
            <div className="mt-1" style={{ color: merchant.lastContactDateValue > 0 ? "#1a1a1a" : "#999" }}>
              {lastContactLabel}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
