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

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <article
      className="rounded-[12px] border border-[#E8E8E4] bg-white p-5"
      style={{ boxShadow: `inset 0 3px 0 ${color}` }}
    >
      <span className="text-[11px] uppercase tracking-[0.05em] text-[#999]">{label}</span>
      <strong className="mt-3 block text-[20px] font-medium leading-tight text-[#1a1a1a]">{value}</strong>
      {sub ? <span className="mt-1 block text-[12px] text-[#666]">{sub}</span> : null}
    </article>
  );
}

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
            setError("Aucune fiche parrainage trouvée pour cet utilisateur.");
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
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto grid max-w-[1440px] gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1a1a1a]">Détail parrain</h1>
            <p className="mt-1 text-[14px] text-[#666]">
              Fiche basée sur les referrals acceptés et le statut bonus lu sur le joueur.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/parrainage"
              className="inline-flex items-center rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-2 text-[13px] font-medium text-[#666] hover:bg-[#F7F7F5]"
            >
              ← Retour à la liste
            </Link>
            {details ? (
              <Link
                href={`/admin/joueurs/${details.userId}`}
                className="inline-flex items-center rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-2 text-[13px] font-medium text-[#666] hover:bg-[#F7F7F5]"
              >
                Voir le joueur
              </Link>
            ) : null}
          </div>
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="rounded-[12px] border border-[#E8E8E4] bg-white px-5 py-8 text-center text-[#666]">
            <div className="loader" aria-hidden="true" />
            <p className="mt-3">Chargement de la fiche parrainage…</p>
          </div>
        )}

        {!loading && error && <p className="feedback error">{error}</p>}

        {!loading && !error && details ? (
          <>
            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Parrain" value={details.label} sub={details.email} color="rgba(159,177,199,0.7)" />
              <StatCard
                label="Dernier code généré"
                value={details.latestInviteCode}
                sub={`${details.inviteCodes.length} code(s) enregistré(s)`}
                color="#4F7CFF"
              />
              <StatCard
                label="Statut bonus"
                value={details.bonusStatusLabel}
                sub={details.bonusStatus === "aucun" ? "Aucune expiration" : details.bonusExpiresAtLabel}
                color={details.bonusStatus === "actif" ? "#639922" : "#EF9F27"}
              />
              <StatCard
                label="Filleuls / bonus"
                value={details.acceptedInviteesCount}
                sub={`${details.grantedRewardsCount} bonus accordé(s)`}
                color="#639922"
              />
            </div>

            {/* Contact + pending */}
            <div className="grid gap-4 sm:grid-cols-2">
              <article className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
                <span className="text-[11px] uppercase tracking-[0.05em] text-[#999]">Contact</span>
                <strong className="mt-2 block text-[16px] font-medium text-[#1a1a1a]">
                  {details.phone || "—"}
                </strong>
                <span className="mt-1 block text-[13px] text-[#666]">{details.email}</span>
              </article>
              <article className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
                <span className="text-[11px] uppercase tracking-[0.05em] text-[#999]">Invitations en attente</span>
                <strong className="mt-2 block text-[16px] font-medium text-[#1a1a1a]">
                  {details.pendingReferralsCount}
                </strong>
                <span className="mt-1 block text-[13px] text-[#666]">Referrals encore non acceptés</span>
              </article>
            </div>

            {/* Codes */}
            <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
              <span className="text-[11px] uppercase tracking-[0.05em] text-[#999]">Codes enregistrés</span>
              <div className="mt-3 flex flex-wrap gap-2">
                {details.inviteCodes.map((inviteCode) => (
                  <code
                    key={inviteCode}
                    className="rounded-[6px] bg-[#F7F7F5] px-2.5 py-1.5 text-[12px] font-medium text-[#1a1a1a]"
                  >
                    {inviteCode}
                  </code>
                ))}
              </div>
            </div>

            {/* Invitees table */}
            <div className="overflow-x-auto rounded-[12px] border border-[#E8E8E4] bg-white">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#E8E8E4] text-left text-[11px] uppercase tracking-[0.06em] text-[#999]">
                    <th className="px-4 py-3 font-medium">Filleul</th>
                    <th className="px-4 py-3 font-medium">Code appliqué</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Bonus</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {details.invitees.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[#999]">
                        Aucun filleul accepté pour ce parrain.
                      </td>
                    </tr>
                  ) : null}
                  {details.invitees.map((invitee) => (
                    <tr
                      key={invitee.referralId}
                      className="border-b border-[#F0F0EC] last:border-b-0 hover:bg-[#FCFCFB]"
                    >
                      <td className="px-4 py-3">
                        <span className="block font-medium text-[#1a1a1a]">{invitee.label}</span>
                        <span className="block text-[11px] text-[#999]">{invitee.email}</span>
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded-[6px] bg-[#F7F7F5] px-2 py-1 text-[12px] font-medium text-[#1a1a1a]">
                          {invitee.inviteCode}
                        </code>
                        <span className="mt-1 block text-[11px] text-[#999]">
                          Date inscription : {invitee.signupAtLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-[#1a1a1a]">{invitee.acceptedAtLabel}</span>
                        <span className="block text-[11px] text-[#999]">Date d&apos;application du code</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-[#1a1a1a]">{invitee.rewardStatusLabel}</span>
                        <span className="block text-[11px] text-[#999]">{invitee.rewardGrantedAtLabel}</span>
                      </td>
                      <td className="px-4 py-3">
                        {invitee.inviteeUserId ? (
                          <Link
                            href={`/admin/joueurs/${invitee.inviteeUserId}`}
                            className="inline-flex items-center rounded-[7px] border border-[#E0E0DA] bg-[#F7F7F5] px-3 py-1.5 text-[12px] font-medium text-[#666] transition hover:border-[#CFE5AF] hover:bg-[#EAF3DE] hover:text-[#3B6D11]"
                          >
                            Voir le joueur
                          </Link>
                        ) : (
                          <span className="inline-flex rounded-full bg-[#F0F0EC] px-2.5 py-1 text-[11px] font-medium text-[#999]">
                            Utilisateur indisponible
                          </span>
                        )}
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
