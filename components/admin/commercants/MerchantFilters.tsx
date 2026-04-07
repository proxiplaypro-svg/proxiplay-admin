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
  return (
    <div className="rounded-[26px] border border-[rgba(159,177,199,0.08)] bg-[rgba(255,255,255,0.04)] p-4">
      <div className="grid gap-4 xl:grid-cols-[auto_auto_minmax(0,1fr)] xl:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[0.92rem] font-medium text-[var(--muted)]">Suivi</span>
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onFilterChange(option.value)}
                className={`rounded-[16px] border px-4 py-2 text-[0.92rem] transition ${
                  filter === option.value
                    ? "border-[rgba(99,153,34,0.32)] bg-[rgba(99,153,34,0.14)] text-[var(--foreground)]"
                    : "border-[rgba(159,177,199,0.1)] bg-[rgba(255,255,255,0.03)] text-[var(--muted)] hover:border-[rgba(159,177,199,0.18)] hover:text-[var(--foreground)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className="grid gap-2">
          <span className="text-[0.92rem] font-medium text-[var(--muted)]">Tri</span>
          <select
            className="search-input min-w-[220px]"
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
          <span className="text-[0.92rem] font-medium text-[var(--muted)]">Recherche</span>
          <input
            className="search-input"
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
