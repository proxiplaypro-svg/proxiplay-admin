"use client";

import type { GameMerchantOption, GameStatus } from "@/types/dashboard";

export type GamesFilterValue = "tous" | GameStatus;
export type GamesSortValue = "end_asc" | "end_desc" | "sessions_desc" | "created_desc";

type GameFiltersProps = {
  status: GamesFilterValue;
  merchantId: string;
  search: string;
  sort: GamesSortValue;
  merchants: GameMerchantOption[];
  onStatusChange: (value: GamesFilterValue) => void;
  onMerchantChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: GamesSortValue) => void;
};

const fieldLabelClassName =
  "text-[11px] font-medium text-[#666666]";

const selectClassName =
  "min-w-[132px] border-0 bg-transparent px-0 py-0 text-[13px] font-medium text-[#1A1A1A] outline-none";

export function GameFilters({
  status,
  merchantId,
  search,
  sort,
  merchants,
  onStatusChange,
  onMerchantChange,
  onSearchChange,
  onSortChange,
}: GameFiltersProps) {
  return (
    <section
      className="flex flex-col gap-3 rounded-[12px] border border-[#E8E8E4] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="flex min-w-0 items-center gap-2 lg:flex-none">
          <span className={fieldLabelClassName}>Statut</span>
          <select
            className={selectClassName}
            value={status}
            onChange={(event) => onStatusChange(event.target.value as GamesFilterValue)}
          >
            <option value="tous">Tous</option>
            <option value="actif">Actif</option>
            <option value="expire">Expire</option>
            <option value="brouillon">Brouillon</option>
            <option value="prive">Prive</option>
          </select>
        </label>

        <div className="hidden h-6 w-px bg-[#F0F0EC] lg:block" />

        <label className="flex min-w-0 items-center gap-2 lg:flex-none">
          <span className={fieldLabelClassName}>Marchand</span>
          <select
            className={`${selectClassName} max-w-[190px]`}
            value={merchantId}
            onChange={(event) => onMerchantChange(event.target.value)}
          >
            <option value="tous">Tous les marchands</option>
            {merchants.map((merchant) => (
              <option key={merchant.id} value={merchant.id}>
                {merchant.name}
              </option>
            ))}
          </select>
        </label>

        <div className="hidden h-6 w-px bg-[#F0F0EC] lg:block" />

        <label className="flex min-w-0 items-center gap-2 lg:flex-none">
          <span className={fieldLabelClassName}>Tri</span>
          <select
            className={`${selectClassName} max-w-[170px]`}
            value={sort}
            onChange={(event) => onSortChange(event.target.value as GamesSortValue)}
          >
            <option value="created_desc">Plus récent</option>
            <option value="end_asc">Expiration proche</option>
            <option value="end_desc">Expiration lointaine</option>
            <option value="sessions_desc">Parties desc</option>
          </select>
        </label>

        <div className="hidden h-6 w-px bg-[#F0F0EC] lg:block" />

        <label className="min-w-0 flex-1">
          <input
            className="w-full border-0 bg-transparent px-0 py-0 text-[13px] text-[#1A1A1A] outline-none placeholder:text-[#999999]"
            type="search"
            placeholder="Rechercher un jeu..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      </div>
    </section>
  );
}
