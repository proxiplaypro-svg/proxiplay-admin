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

export default function AdminReferralPage() {
  const [overview, setOverview] = useState<AdminReferralOverview | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ReferralFilter>("tous");
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

  const visibleGrantedRewards = filteredInviters.reduce(
    (total, inviter) => total + inviter.grantedRewardsCount,
    0,
  );

  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Parrainage</h2>
          <p>
            Vue admin sobre du systeme `share_promo`, basee sur `referrals` et le statut bonus
            lu sur `users`. Le code affiche ici le dernier code genere par parrain.
          </p>
        </div>

        {loading ? <p className="feedback neutral">Chargement du suivi parrainage...</p> : null}
        {error ? <p className="feedback error">{error}</p> : null}

        {!loading && !error && overview ? (
          <>
            <div className="overview-grid referral-kpi-grid">
              <article className="overview-card">
                <span>Parrains avec code</span>
                <strong>{overview.invitersCount}</strong>
              </article>
              <article className="overview-card">
                <span>Filleuls</span>
                <strong>{overview.inviteesCount}</strong>
              </article>
              <article className="overview-card">
                <span>Bonus accordes</span>
                <strong>{overview.grantedRewardsCount}</strong>
              </article>
              <article className="overview-card">
                <span>Bonus actifs</span>
                <strong>{overview.activeBonusesCount}</strong>
              </article>
            </div>

            <div className="games-toolbar referral-toolbar">
              <label className="search-field">
                <span className="search-label">Recherche</span>
                <input
                  className="search-input"
                  type="search"
                  placeholder="Pseudo, email ou code de parrainage"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>

              <label className="search-field">
                <span className="search-label">Filtre</span>
                <select value={filter} onChange={(event) => setFilter(event.target.value as ReferralFilter)}>
                  <option value="tous">Tous</option>
                  <option value="avec_filleuls">Avec filleuls</option>
                  <option value="sans_filleul">Sans filleul</option>
                  <option value="bonus_actif">Bonus actif</option>
                  <option value="bonus_expire">Bonus expire</option>
                </select>
              </label>
            </div>

            <div className="referral-summary-row">
              <p>
                {filteredInviters.length} parrain(s) affiches sur {overview.invitersCount}
              </p>
              <p>
                {visibleGrantedRewards} bonus accordes visibles
                {overview.lastStatsUpdateLabel ? ` - stats mises a jour ${overview.lastStatsUpdateLabel}` : ""}
              </p>
            </div>

            <div className="games-table-body">
              <div className="referral-table-header">
                <span>Parrain</span>
                <span>Code</span>
                <span>Filleuls</span>
                <span>Derniere utilisation</span>
                <span>Bonus</span>
                <span>Actions</span>
              </div>

              {filteredInviters.length === 0 ? (
                <p className="feedback neutral">
                  Aucun parrain ne correspond aux filtres actuels.
                </p>
              ) : null}

              {filteredInviters.map((inviter) => (
                <ReferralRow key={inviter.userId} inviter={inviter} />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function ReferralRow({ inviter }: { inviter: AdminReferralInviterListItem }) {
  return (
    <article className="referral-table-row">
      <div className="games-cell" data-label="Parrain">
        <strong>{inviter.label}</strong>
        <span>{inviter.email}</span>
      </div>

      <div className="games-cell" data-label="Code">
        <strong>{inviter.latestInviteCode}</strong>
        <span>{inviter.inviteCodesCount} code(s) genere(s)</span>
      </div>

      <div className="games-cell" data-label="Filleuls">
        <strong>{inviter.acceptedInviteesCount}</strong>
        <span>{inviter.pendingReferralsCount} invitation(s) en attente</span>
      </div>

      <div className="games-cell" data-label="Derniere utilisation">
        <strong>{inviter.lastAcceptedAtLabel}</strong>
        <span>{inviter.grantedRewardsCount} bonus accorde(s)</span>
      </div>

      <div className="games-cell" data-label="Bonus">
        <span className={`referral-status-badge ${inviter.bonusStatus}`}>{inviter.bonusStatusLabel}</span>
        <span>{inviter.bonusStatus === "aucun" ? "Aucune expiration" : inviter.bonusExpiresAtLabel}</span>
      </div>

      <div className="games-cell referral-actions-cell" data-label="Actions">
        <Link className="secondary-button" href={`/admin/parrainage/${inviter.userId}`}>
          Voir detail
        </Link>
      </div>
    </article>
  );
}
