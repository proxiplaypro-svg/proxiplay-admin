"use client";

import { useEffect, useState } from "react";
import {
  approveMerchantReferral,
  getMerchantReferralsOverview,
  markMerchantReferralPaid,
  rejectMerchantReferral,
  type AdminMerchantReferralItem,
} from "@/lib/firebase/merchantBillingQueries";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  linked: { label: "Lie (en attente de paiement)", className: "bg-[#F0F0EC] text-[#999]" },
  eligible: { label: "Eligible", className: "bg-[#FDF3D9] text-[#8A6D1A]" },
  approved: { label: "Approuve", className: "bg-[#DCE9FB] text-[#1D4E89]" },
  paid: { label: "Paye", className: "bg-[#EAF3DE] text-[#3B6D11]" },
  rejected: { label: "Rejete", className: "bg-[#FCEBEB] text-[#A32D2D]" },
  cancelled: { label: "Annule", className: "bg-[#FCEBEB] text-[#A32D2D]" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_LABELS[status] || { label: status, className: "bg-[#F0F0EC] text-[#999]" };
  return (
    <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export default function AdminParrainageCommercantsPage() {
  const [items, setItems] = useState<AdminMerchantReferralItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyMerchantUserId, setBusyMerchantUserId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminMerchantReferralItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [payTarget, setPayTarget] = useState<AdminMerchantReferralItem | null>(null);
  const [payReference, setPayReference] = useState("");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMerchantReferralsOverview();
      setItems(data);
    } catch (err) {
      console.error(err);
      setError("Impossible de charger les parrainages commercants.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleApprove = async (item: AdminMerchantReferralItem) => {
    if (!window.confirm(`Approuver la prime de 100€ pour ${item.inviterLabel} (commercant ${item.merchantLabel}) ?`)) {
      return;
    }
    setBusyMerchantUserId(item.merchantUserId);
    setActionFeedback(null);
    try {
      await approveMerchantReferral(item.merchantUserId);
      await load();
    } catch (err) {
      console.error(err);
      setActionFeedback("Approbation impossible pour le moment.");
    } finally {
      setBusyMerchantUserId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setBusyMerchantUserId(rejectTarget.merchantUserId);
    setActionFeedback(null);
    try {
      await rejectMerchantReferral(rejectTarget.merchantUserId, rejectReason.trim());
      setRejectTarget(null);
      setRejectReason("");
      await load();
    } catch (err) {
      console.error(err);
      setActionFeedback("Rejet impossible pour le moment.");
    } finally {
      setBusyMerchantUserId(null);
    }
  };

  const handleMarkPaid = async () => {
    if (!payTarget || !payReference.trim()) return;
    setBusyMerchantUserId(payTarget.merchantUserId);
    setActionFeedback(null);
    try {
      await markMerchantReferralPaid(payTarget.merchantUserId, payReference.trim());
      setPayTarget(null);
      setPayReference("");
      await load();
    } catch (err) {
      console.error(err);
      setActionFeedback("Marquage paye impossible pour le moment.");
    } finally {
      setBusyMerchantUserId(null);
    }
  };

  return (
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto grid max-w-[1440px] gap-6">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1a1a1a]">Parrainage commercants</h1>
          <p className="mt-1 text-[14px] text-[#666]">
            Prime de 100€ pour un joueur ayant parraine un commercant devenu client payant. La prime n&apos;est
            jamais acquise avant confirmation serveur du premier paiement Stripe ; le paiement des 100€ reste
            manuel (V1) et trace ici.
          </p>
        </div>

        {actionFeedback && <p className="feedback error">{actionFeedback}</p>}
        {loading && (
          <div className="rounded-[12px] border border-[#E8E8E4] bg-white px-5 py-8 text-center text-[#666]">
            Chargement...
          </div>
        )}
        {!loading && error && <p className="feedback error">{error}</p>}

        {!loading && !error && (
          <div className="overflow-x-auto rounded-[12px] border border-[#E8E8E4] bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#E8E8E4] text-left text-[11px] uppercase tracking-[0.06em] text-[#999]">
                  <th className="px-4 py-3 font-medium">Parrain</th>
                  <th className="px-4 py-3 font-medium">Commercant</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Abonnement</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#999]">
                      Aucun parrainage commercant pour le moment.
                    </td>
                  </tr>
                )}
                {items.map((item) => (
                  <tr key={item.merchantUserId} className="border-b border-[#F0F0EC] last:border-b-0 hover:bg-[#FCFCFB]">
                    <td className="px-4 py-3 font-medium text-[#1a1a1a]">{item.inviterLabel}</td>
                    <td className="px-4 py-3 text-[#666]">{item.merchantLabel}</td>
                    <td className="px-4 py-3">
                      <code className="rounded-[6px] bg-[#F7F7F5] px-2 py-1 text-[12px] font-medium text-[#1a1a1a]">
                        {item.code || "—"}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-[#666]">{item.subscriptionAmountHtLabel || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={item.status} />
                        {item.status === "rejected" && item.rejectedReason ? (
                          <span className="text-[11px] text-[#999]">{item.rejectedReason}</span>
                        ) : null}
                        {item.status === "paid" && item.paidReference ? (
                          <span className="text-[11px] text-[#999]">{item.paidReference} · {item.paidAtLabel}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {item.status === "eligible" && (
                          <>
                            <button
                              type="button"
                              disabled={busyMerchantUserId === item.merchantUserId}
                              onClick={() => void handleApprove(item)}
                              className="rounded-[7px] border border-[#639922] bg-white px-3 py-1.5 text-[12px] font-medium text-[#639922] transition hover:bg-[#F0F7E8] disabled:opacity-50"
                            >
                              Approuver
                            </button>
                            <button
                              type="button"
                              disabled={busyMerchantUserId === item.merchantUserId}
                              onClick={() => { setRejectTarget(item); setRejectReason(""); }}
                              className="rounded-[7px] border border-[#E24B4A] bg-white px-3 py-1.5 text-[12px] font-medium text-[#E24B4A] transition hover:bg-[#FCEBEB] disabled:opacity-50"
                            >
                              Rejeter
                            </button>
                          </>
                        )}
                        {item.status === "approved" && (
                          <>
                            <button
                              type="button"
                              disabled={busyMerchantUserId === item.merchantUserId}
                              onClick={() => { setPayTarget(item); setPayReference(""); }}
                              className="rounded-[7px] border border-[#639922] bg-white px-3 py-1.5 text-[12px] font-medium text-[#639922] transition hover:bg-[#F0F7E8] disabled:opacity-50"
                            >
                              Marquer paye
                            </button>
                            <button
                              type="button"
                              disabled={busyMerchantUserId === item.merchantUserId}
                              onClick={() => { setRejectTarget(item); setRejectReason(""); }}
                              className="rounded-[7px] border border-[#E24B4A] bg-white px-3 py-1.5 text-[12px] font-medium text-[#E24B4A] transition hover:bg-[#FCEBEB] disabled:opacity-50"
                            >
                              Rejeter
                            </button>
                          </>
                        )}
                        {["linked", "paid", "rejected", "cancelled"].includes(item.status) && (
                          <span className="text-[12px] text-[#999]">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-[12px] border border-[#E8E8E4] bg-white p-6 shadow-lg">
            <h3 className="text-[16px] font-medium text-[#1a1a1a]">Rejeter le parrainage ?</h3>
            <p className="mt-2 text-[13px] text-[#666]">
              {rejectTarget.inviterLabel} · {rejectTarget.merchantLabel}. Cette action est tracee et irreversible.
            </p>
            <textarea
              className="mt-3 w-full rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[13px]"
              rows={3}
              placeholder="Motif du rejet (obligatoire)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="flex-1 rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-2 text-[13px] text-[#666]"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim() || busyMerchantUserId === rejectTarget.merchantUserId}
                onClick={() => void handleReject()}
                className="flex-1 rounded-[8px] bg-[#E24B4A] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
              >
                Confirmer le rejet
              </button>
            </div>
          </div>
        </div>
      )}

      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-[12px] border border-[#E8E8E4] bg-white p-6 shadow-lg">
            <h3 className="text-[16px] font-medium text-[#1a1a1a]">Marquer les 100€ comme payes ?</h3>
            <p className="mt-2 text-[13px] text-[#666]">
              {payTarget.inviterLabel} · {payTarget.merchantLabel}. Le paiement reste manuel (V1) : indiquez une
              reference fiable (virement, transaction...).
            </p>
            <input
              className="mt-3 w-full rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[13px]"
              placeholder="Reference de paiement (obligatoire)"
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
            />
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setPayTarget(null)}
                className="flex-1 rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-2 text-[13px] text-[#666]"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!payReference.trim() || busyMerchantUserId === payTarget.merchantUserId}
                onClick={() => void handleMarkPaid()}
                className="flex-1 rounded-[8px] bg-[#639922] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
              >
                Confirmer le paiement
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
