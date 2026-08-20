"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getReferralOverview,
  type AdminReferralInviterListItem,
  type AdminReferralOverview,
} from "@/lib/firebase/adminQueries";

function normalizeString(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

type ReferralFilter = "tous" | "avec_filleuls" | "sans_filleul" | "bonus_actif" | "bonus_expire";

const FILTERS: { value: ReferralFilter; label: string }[] = [
  { value: "tous", label: "Tous" },
  { value: "avec_filleuls", label: "Avec filleuls" },
  { value: "sans_filleul", label: "Sans filleul" },
  { value: "bonus_actif", label: "Bonus actif" },
  { value: "bonus_expire", label: "Bonus expiré" },
];

type SortField = "date" | "filleuls" | "codes" | "bonus";
type SortDirection = "asc" | "desc";

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "date", label: "Dernière utilisation" },
  { value: "filleuls", label: "Nombre de filleuls" },
  { value: "codes", label: "Codes générés" },
  { value: "bonus", label: "Bonus accordés" },
];

function sortValue(inviter: AdminReferralInviterListItem, field: SortField): number {
  switch (field) {
    case "date":
      return inviter.lastAcceptedAtValue;
    case "filleuls":
      return inviter.acceptedInviteesCount;
    case "codes":
      return inviter.inviteCodesCount;
    case "bonus":
      return inviter.grantedRewardsCount;
  }
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <article
      className="rounded-[12px] border border-[#E8E8E4] bg-white p-5"
      style={{ boxShadow: `inset 0 3px 0 ${color}` }}
    >
      <span className="text-[11px] uppercase tracking-[0.05em] text-[#999]">{label}</span>
      <strong className="mt-3 block text-[28px] font-medium leading-none text-[#1a1a1a]">{value}</strong>
    </article>
  );
}

function BonusBadge({ inviter }: { inviter: AdminReferralInviterListItem }) {
  const style =
    inviter.bonusStatus === "actif"
      ? "bg-[#EAF3DE] text-[#3B6D11]"
      : inviter.bonusStatus === "expire"
        ? "bg-[#F0F0EC] text-[#999]"
        : "bg-[#F0F0EC] text-[#999]";

  return (
    <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-medium ${style}`}>
      {inviter.bonusStatusLabel}
    </span>
  );
}

export default function AdminReferralPage() {
  const [overview, setOverview] = useState<AdminReferralOverview | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ReferralFilter>("tous");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadOverview = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await getReferralOverview();

        if (!isCancelled) {
          setOverview(result);
        }
      } catch (loadError) {
        console.error(loadError);

        if (!isCancelled) {
          setError("Impossible de charger le suivi du parrainage pour le moment.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadOverview();

    return () => {
      isCancelled = true;
    };
  }, []);

  const inviters = overview?.inviters ?? [];

  const filteredInviters = useMemo(() => {
    const normalizedSearch = normalizeString(search.trim());

    return inviters.filter((inviter) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        normalizeString(inviter.label).includes(normalizedSearch) ||
        normalizeString(inviter.email).includes(normalizedSearch) ||
        normalizeString(inviter.searchableInviteCodes).includes(normalizedSearch);

      const matchesFilter = (() => {
        switch (filter) {
          case "avec_filleuls":
            return inviter.acceptedInviteesCount > 0;
          case "sans_filleul":
            return inviter.acceptedInviteesCount === 0;
          case "bonus_actif":
            return inviter.bonusStatus === "actif";
          case "bonus_expire":
            return inviter.bonusStatus === "expire";
          default:
            return true;
        }
      })();

      return matchesSearch && matchesFilter;
    });
  }, [filter, inviters, search]);

  const sortedInviters = useMemo(() => {
    const directionMultiplier = sortDirection === "asc" ? 1 : -1;
    return [...filteredInviters].sort(
      (a, b) => (sortValue(a, sortField) - sortValue(b, sortField)) * directionMultiplier,
    );
  }, [filteredInviters, sortField, sortDirection]);

  const visibleGrantedRewards = filteredInviters.reduce(
    (total, inviter) => total + inviter.grantedRewardsCount,
    0,
  );

  return (
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto grid max-w-[1440px] gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1a1a1a]">Parrainage</h1>
            <p className="mt-1 text-[14px] text-[#666]">
              Vue admin du système de parrainage — codes, filleuls et statut des bonus.
            </p>
          </div>
          <Link
            href="/admin/parrainage/jeu"
            className="inline-flex items-center justify-center rounded-[10px] bg-[#639922] px-5 py-3 text-[14px] font-medium text-white hover:bg-[#5a8b1f]"
          >
            🎁 Gérer le jeu de parrainage
          </Link>
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="rounded-[12px] border border-[#E8E8E4] bg-white px-5 py-8 text-center text-[#666]">
            <div className="loader" aria-hidden="true" />
            <p className="mt-3">Chargement du suivi parrainage…</p>
          </div>
        )}

        {!loading && error && <p className="feedback error">{error}</p>}

        {!loading && !error && overview ? (
          <>
            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Parrains avec code" value={overview.invitersCount} color="rgba(159,177,199,0.7)" />
              <StatCard label="Filleuls" value={overview.inviteesCount} color="#4F7CFF" />
              <StatCard label="Bonus accordés" value={overview.grantedRewardsCount} color="#639922" />
              <StatCard label="Bonus actifs" value={overview.activeBonusesCount} color="#EF9F27" />
            </div>

            {/* Search + filters */}
            <div className="flex flex-col gap-4 rounded-[12px] border border-[#E8E8E4] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <input
                className="w-full max-w-sm rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="search"
                placeholder="Pseudo, email ou code de parrainage"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFilter(f.value)}
                    className={`rounded-full border px-4 py-1.5 text-[13px] font-medium transition ${
                      filter === f.value
                        ? "border-[#639922] bg-[#639922] text-white"
                        : "border-[#E0E0DA] bg-white text-[#666] hover:bg-[#F7F7F5]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[12px] font-medium text-[#666]">Trier par</span>
              <select
                value={sortField}
                onChange={(event) => setSortField(event.target.value as SortField)}
                className="rounded-[8px] border border-[#E0E0DA] bg-white px-3 py-1.5 text-[13px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E0E0DA] bg-white px-3 py-1.5 text-[13px] font-medium text-[#666] hover:bg-[#F7F7F5]"
                title={sortDirection === "asc" ? "Croissant" : "Décroissant"}
              >
                {sortDirection === "asc" ? "↑ Croissant" : "↓ Décroissant"}
              </button>
            </div>

            <p className="text-[13px] text-[#666]">
              {filteredInviters.length} parrain(s) affiché(s) sur {overview.invitersCount} — {visibleGrantedRewards} bonus
              accordés visibles
              {overview.lastStatsUpdateLabel ? ` · stats mises à jour ${overview.lastStatsUpdateLabel}` : ""}
            </p>

            {/* Table */}
            <div className="overflow-x-auto rounded-[12px] border border-[#E8E8E4] bg-white">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#E8E8E4] text-left text-[11px] uppercase tracking-[0.06em] text-[#999]">
                    <th className="px-4 py-3 font-medium">Parrain</th>
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Filleuls</th>
                    <th className="px-4 py-3 font-medium">Dernière utilisation</th>
                    <th className="px-4 py-3 font-medium">Bonus</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedInviters.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[#999]">
                        Aucun parrain ne correspond aux filtres actuels.
                      </td>
                    </tr>
                  )}
                  {sortedInviters.map((inviter) => (
                    <tr key={inviter.userId} className="border-b border-[#F0F0EC] last:border-b-0 hover:bg-[#FCFCFB]">
                      <td className="px-4 py-3">
                        <span className="block font-medium text-[#1a1a1a]">{inviter.label}</span>
                        <span className="block text-[11px] text-[#999]">{inviter.email}</span>
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded-[6px] bg-[#F7F7F5] px-2 py-1 text-[12px] font-medium text-[#1a1a1a]">
                          {inviter.latestInviteCode}
                        </code>
                        <span className="mt-1 block text-[11px] text-[#999]">
                          {inviter.inviteCodesCount} code(s) généré(s)
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block font-medium text-[#1a1a1a]">{inviter.acceptedInviteesCount}</span>
                        <span className="block text-[11px] text-[#999]">
                          {inviter.pendingReferralsCount} invitation(s) en attente
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-[#1a1a1a]">{inviter.lastAcceptedAtLabel}</span>
                        <span className="block text-[11px] text-[#999]">
                          {inviter.grantedRewardsCount} bonus accordé(s)
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <BonusBadge inviter={inviter} />
                          <span className="text-[11px] text-[#999]">
                            {inviter.bonusStatus === "aucun" ? "Aucune expiration" : inviter.bonusExpiresAtLabel}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/parrainage/${inviter.userId}`}
                          className="inline-flex items-center rounded-[7px] border border-[#E0E0DA] bg-[#F7F7F5] px-3 py-1.5 text-[12px] font-medium text-[#666] transition hover:border-[#CFE5AF] hover:bg-[#EAF3DE] hover:text-[#3B6D11]"
                        >
                          Voir détail
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
