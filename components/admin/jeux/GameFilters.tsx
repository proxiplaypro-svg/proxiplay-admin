"use client";

import type { GameMerchantOption, GameStatus } from "@/types/dashboard";

export type GamesFilterValue = "tous" | GameStatus;
export type GamesSortValue = "end_asc" | "end_desc" | "sessions_desc";

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
    <section className="games-manager-filters">
      <div className="games-manager-filter-grid">
        <label className="games-filter-field">
          <span className="search-label">Statut</span>
          <select
            className="games-filter-select"
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

        <label className="games-filter-field">
          <span className="search-label">Marchand</span>
          <select
            className="games-filter-select"
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

        <label className="games-filter-field">
          <span className="search-label">Tri</span>
          <select
            className="games-filter-select"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as GamesSortValue)}
          >
            <option value="end_asc">Expiration (proche)</option>
            <option value="end_desc">Expiration (lointaine)</option>
            <option value="sessions_desc">Nombre de parties</option>
          </select>
        </label>
      </div>

      <label className="games-filter-field games-manager-search">
        <span className="search-label">Recherche</span>
        <input
          className="search-input"
          type="search"
          placeholder="Rechercher un jeu..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
    </section>
  );
}
