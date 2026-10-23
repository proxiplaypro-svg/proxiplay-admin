"use client";

import { useEffect, useState } from "react";
import { MerchantReferralProgramToggle } from "@/components/admin/MerchantReferralProgramToggle";
import {
  approveMerchantReferral,
  confirmMerchantFirstPayment,
  getMerchantReferralsOverview,
  markMerchantReferralPaid,
  rejectMerchantReferral,
  type AdminMerchantReferralItem,
} from "@/lib/firebase/merchantBillingQueries";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  linked: { label: "Rattaché (en attente du 1er abonnement payé)", className: "bg-[#F0F0EC] text-[#999]" },
  eligible: { label: "Éligible (1er abonnement payé)", className: "bg-[#FDF3D9] text-[#8A6D1A]" },
  approved: { label: "Approuve", className: "bg-[#DCE9FB] text-[#1D4E89]" },
  paid: { label: "Remise enregistrée", className: "bg-[#EAF3DE] text-[#3B6D11]" },
  rejected: { label: "Rejete", className: "bg-[#FCEBEB] text-[#A32D2D]" },
  cancelled: { label: "Annulé", className: "bg-[#FCEBEB] text-[#A32D2D]" },
};

const INVITER_KIND_LABELS: Record<string, string> = {
  joueur: "Joueur",
  commercant: "Commerçant",
};

function todayIsoDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

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
  const [confirmTarget, setConfirmTarget] = useState<AdminMerchantReferralItem | null>(null);
  const [confirmReference, setConfirmReference] = useState("");
  const [confirmPaidAt, setConfirmPaidAt] = useState("");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMerchantReferralsOverview();
      setItems(data);
    } catch (err) {
      console.error(err);
      setError("Impossible de charger les parrainages commerçants.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleConfirmPayment = async () => {
    if (!confirmTarget || !confirmReference.trim() || !confirmPaidAt) return;
    setBusyMerchantUserId(confirmTarget.merchantUserId);
    setActionFeedback(null);
    try {
      await confirmMerchantFirstPayment(confirmTarget.merchantUserId, confirmReference.trim(), confirmPaidAt);
      setConfirmTarget(null);
      setConfirmReference("");
      setConfirmPaidAt("");
      await load();
    } catch (err) {
      console.error(err);
      setActionFeedback("Confirmation du premier abonnement impossible (déjà confirmé ou données invalides).");
    } finally {
      setBusyMerchantUserId(null);
    }
  };

  const handleApprove = async (item: AdminMerchantReferralItem) => {
    if (!window.confirm(`Approuver les 50 € en bons cadeaux pour ${item.inviterLabel} (commerçant ${item.merchantLabel}) ?`)) {
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
      setActionFeedback("Enregistrement de la remise impossible pour le moment.");
    } finally {
      setBusyMerchantUserId(null);
    }
  };

  return (
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto grid max-w-[1440px] gap-6">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1a1a1a]">Parrainage commerçants</h1>
          <p className="mt-1 text-[14px] text-[#666]">
            50 € en bons cadeaux (jamais en espèces) pour la personne, joueur ou commerçant, qui a recommandé
            un commerçant. Le code est saisi par le commerçant à la création de son compte. La récompense
            n&apos;est due qu&apos;après confirmation du premier abonnement payé, puis validation. La création et la
            remise des bons cadeaux ne sont pas automatisées ; cette page enregistre seulement leurs références.
          </p>
        </div>

        <MerchantReferralProgramToggle />

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
                  <th className="px-4 py-3 font-medium">Commerçant</th>
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
                      Aucun parrainage commerçant pour le moment.
                    </td>
                  </tr>
                )}
                {items.map((item) => (
                  <tr key={item.merchantUserId} className="border-b border-[#F0F0EC] last:border-b-0 hover:bg-[#FCFCFB]">
                    <td className="px-4 py-3 font-medium text-[#1a1a1a]">
                      <div className="flex flex-col gap-0.5">
                        <span>{item.inviterLabel}</span>
                        {item.inviterKind ? (
                          <span className="text-[11px] font-normal text-[#999]">
                            {INVITER_KIND_LABELS[item.inviterKind] || item.inviterKind}
                          </span>
                        ) : null}
                      </div>
                    </td>
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
                        {item.paymentConfirmation ? (
                          <span className="text-[11px] text-[#999]">
                            1er abonnement payé{item.paymentConfirmation.paidAtLabel ? ` le ${item.paymentConfirmation.paidAtLabel}` : ""}
                            {" · "}
                            {item.paymentConfirmation.method === "manual" ? "confirmé manuellement" : "Stripe"}
                            {item.paymentConfirmation.reference ? ` · ${item.paymentConfirmation.reference}` : ""}
                          </span>
                        ) : null}
                        {item.status === "paid" && item.paidReference ? (
                          <span className="text-[11px] text-[#999]">Bons cadeaux : {item.paidReference} · {item.paidAtLabel}</span>
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
                              Enregistrer la remise
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
                        {item.status === "linked" && (
                          <>
                            <button
                              type="button"
                              disabled={busyMerchantUserId === item.merchantUserId}
                              onClick={() => { setConfirmTarget(item); setConfirmReference(""); setConfirmPaidAt(""); }}
                              className="rounded-[7px] border border-[#639922] bg-white px-3 py-1.5 text-[12px] font-medium text-[#639922] transition hover:bg-[#F0F7E8] disabled:opacity-50"
                            >
                              Confirmer le 1er abonnement payé
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
                        {["paid", "rejected", "cancelled"].includes(item.status) && (
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

      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-[12px] border border-[#E8E8E4] bg-white p-6 shadow-lg">
            <h3 className="text-[16px] font-medium text-[#1a1a1a]">Confirmer le premier abonnement payé ?</h3>
            <p className="mt-2 text-[13px] text-[#666]">
              {confirmTarget.merchantLabel} · parrain {confirmTarget.inviterLabel}. À utiliser seulement après
              encaissement effectif du premier abonnement. Le parrainage devient éligible ; les bons cadeaux
              restent soumis à validation. Action tracée (administrateur, date) et non répétable.
            </p>
            <input
              className="mt-3 w-full rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[13px]"
              placeholder="Référence du règlement ou de la facture (obligatoire)"
              value={confirmReference}
              onChange={(e) => setConfirmReference(e.target.value)}
            />
            <label className="mt-3 block text-[12px] text-[#666]">
              Date du paiement
              <input
                type="date"
                max={todayIsoDate()}
                className="mt-1 w-full rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[13px]"
                value={confirmPaidAt}
                onChange={(e) => setConfirmPaidAt(e.target.value)}
              />
            </label>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="flex-1 rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-2 text-[13px] text-[#666]"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!confirmReference.trim() || !confirmPaidAt || busyMerchantUserId === confirmTarget.merchantUserId}
                onClick={() => void handleConfirmPayment()}
                className="flex-1 rounded-[8px] bg-[#639922] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
              >
                Confirmer le paiement
              </button>
            </div>
          </div>
        </div>
      )}

      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-[12px] border border-[#E8E8E4] bg-white p-6 shadow-lg">
            <h3 className="text-[16px] font-medium text-[#1a1a1a]">Enregistrer la remise des bons cadeaux ?</h3>
            <p className="mt-2 text-[13px] text-[#666]">
              {payTarget.inviterLabel} · {payTarget.merchantLabel}. Cette action enregistre la remise déjà
              effectuée de 50 € en bons cadeaux ; elle ne crée ni n&apos;envoie les bons. Indiquez une référence de suivi.
            </p>
            <input
              className="mt-3 w-full rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[13px]"
              placeholder="Référence des bons cadeaux (obligatoire)"
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
                Confirmer la remise
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
