"use client";

import type { MerchantPilotageFilter, MerchantPilotageSort } from "@/types/dashboard";

type MerchantFiltersProps = {
  filter: MerchantPilotageFilter;
  sort: MerchantPilotageSort;
  search: string;
  onFilterChange: (value: MerchantPilotageFilter) => void;
  onSortChange: (value: MerchantPilotageSort) => void;
  onSearchChange: (value: string) => void;
};

const FILTER_OPTIONS: Array<{ value: MerchantPilotageFilter; label: string }> = [
  { value: "tous", label: "Tous" },
  { value: "a_relancer", label: "A relancer" },
  { value: "sans_jeu_actif", label: "Sans jeu actif" },
  { value: "actifs", label: "Actifs" },
];

export function MerchantFilters({
  filter,
  sort,
  search,
  onFilterChange,
  onSortChange,
  onSearchChange,
}: MerchantFiltersProps) {
  const controlClassName =
    "min-h-[44px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[13px] text-[#1a1a1a] outline-none transition placeholder:text-[#999] focus:border-[#C0DD97] focus:bg-white";

  return (
    <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-4">
      <div className="grid gap-4 xl:grid-cols-[auto_auto_minmax(0,1fr)] xl:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-medium text-[#666]">Suivi</span>
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onFilterChange(option.value)}
                className={`rounded-[16px] border px-4 py-2 text-[0.92rem] transition ${
                  filter === option.value
                    ? "border-[#C0DD97] bg-[#EAF3DE] font-medium text-[#3B6D11]"
                    : "border-[#E8E8E4] bg-[#F7F7F5] text-[#666] hover:border-[#D9D9D4] hover:bg-[#FAFAF8] hover:text-[#1a1a1a]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className="grid gap-2">
          <span className="text-[13px] font-medium text-[#666]">Tri</span>
          <select
            className={`${controlClassName} min-w-[220px]`}
            value={sort}
            onChange={(event) => onSortChange(event.target.value as MerchantPilotageSort)}
          >
            <option value="score_desc">Score engagement</option>
            <option value="last_contact_desc">Derniere relance</option>
            <option value="participations_desc">Participations J30</option>
            <option value="name_asc">Nom A→Z</option>
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-[13px] font-medium text-[#666]">Recherche</span>
          <input
            className={controlClassName}
            type="search"
            placeholder="Rechercher un marchand..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
