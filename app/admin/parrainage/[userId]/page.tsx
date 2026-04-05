"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getReferralInviterDetails,
  type AdminReferralInviterDetails,
} from "@/lib/firebase/adminQueries";

type ReferralDetailsPageProps = {
  params: Promise<{
    userId: string;
  }>;
};

export default function ReferralDetailsPage({ params }: ReferralDetailsPageProps) {
  const [details, setDetails] = useState<AdminReferralInviterDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadDetails = async () => {
      setLoading(true);
      setError(null);

      try {
        const resolvedParams = await params;
        const result = await getReferralInviterDetails(resolvedParams.userId);

        if (!isCancelled) {
          if (result) {
            setDetails(result);
          } else {
            setError("Aucune fiche parrainage trouvee pour cet utilisateur.");
          }
        }
      } catch (loadError) {
        console.error(loadError);

        if (!isCancelled) {
          setError("Impossible de charger cette fiche parrainage pour le moment.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadDetails();

    return () => {
      isCancelled = true;
    };
  }, [params]);

  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Detail parrain</h2>
          <p>Fiche detail d un parrain, basee sur les referrals acceptes et le statut bonus lu sur le user.</p>
        </div>

        <div className="detail-actions-row">
          <Link className="secondary-button" href="/admin/parrainage">
            Retour a la liste
          </Link>
          {details ? (
            <Link className="secondary-button" href={`/admin/joueurs/${details.userId}`}>
              Voir le joueur
            </Link>
          ) : null}
        </div>

        {loading ? <p className="feedback neutral">Chargement de la fiche parrainage...</p> : null}
        {error ? <p className="feedback error">{error}</p> : null}

        {!loading && !error && details ? (
          <>
            <div className="referral-detail-grid">
              <article className="overview-card">
                <span>Parrain</span>
                <strong>{details.label}</strong>
                <p>{details.email}</p>
              </article>
              <article className="overview-card">
                <span>Dernier code genere</span>
                <strong>{details.latestInviteCode}</strong>
                <p>{details.inviteCodes.length} code(s) enregistre(s)</p>
              </article>
              <article className="overview-card">
                <span>Statut bonus</span>
                <strong>{details.bonusStatusLabel}</strong>
                <p>{details.bonusStatus === "aucun" ? "Aucune expiration" : details.bonusExpiresAtLabel}</p>
              </article>
              <article className="overview-card">
                <span>Filleuls / bonus</span>
                <strong>{details.acceptedInviteesCount}</strong>
                <p>{details.grantedRewardsCount} bonus accorde(s)</p>
              </article>
            </div>

            <div className="referral-detail-meta">
              <article className="merchant-summary-card">
                <span>Contact</span>
                <strong>{details.phone}</strong>
                <p>{details.email}</p>
              </article>
              <article className="merchant-summary-card">
                <span>Invitations en attente</span>
                <strong>{details.pendingReferralsCount}</strong>
                <p>Referrals encore non acceptes</p>
              </article>
            </div>

            <div className="referral-codes-panel">
              <span className="search-label">Codes enregistres</span>
              <div className="referral-codes-list">
                {details.inviteCodes.map((inviteCode) => (
                  <code key={inviteCode} className="referral-code-pill">
                    {inviteCode}
                  </code>
                ))}
              </div>
            </div>

            <div className="games-table-body">
              <div className="referral-invitees-header">
                <span>Filleul</span>
                <span>Code applique</span>
                <span>Date</span>
                <span>Bonus</span>
                <span>Actions</span>
              </div>

              {details.invitees.length === 0 ? (
                <p className="feedback neutral">Aucun filleul accepte pour ce parrain.</p>
              ) : null}

              {details.invitees.map((invitee) => (
                <article key={invitee.referralId} className="referral-invitees-row">
                  <div className="games-cell" data-label="Filleul">
                    <strong>{invitee.label}</strong>
                    <span>{invitee.email}</span>
                  </div>

                  <div className="games-cell" data-label="Code applique">
                    <strong>{invitee.inviteCode}</strong>
                    <span>Date inscription: {invitee.signupAtLabel}</span>
                  </div>

                  <div className="games-cell" data-label="Date">
                    <strong>{invitee.acceptedAtLabel}</strong>
                    <span>Date application du code</span>
                  </div>

                  <div className="games-cell" data-label="Bonus">
                    <strong>{invitee.rewardStatusLabel}</strong>
                    <span>{invitee.rewardGrantedAtLabel}</span>
                  </div>

                  <div className="games-cell referral-actions-cell" data-label="Actions">
                    {invitee.inviteeUserId ? (
                      <Link className="secondary-button" href={`/admin/joueurs/${invitee.inviteeUserId}`}>
                        Voir le joueur
                      </Link>
                    ) : (
                      <span className="status-pill neutral">Utilisateur indisponible</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
