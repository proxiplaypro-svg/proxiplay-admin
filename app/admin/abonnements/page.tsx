"use client";

import { useEffect, useState } from "react";
import {
  getMerchantSubscriptionsOverview,
  removeMerchantCustomOffer,
  setMerchantCustomOffer,
  type AdminMerchantSubscriptionItem,
} from "@/lib/firebase/merchantBillingQueries";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: "Actif", className: "bg-[#EAF3DE] text-[#3B6D11]" },
  trialing: { label: "Essai", className: "bg-[#EAF3DE] text-[#3B6D11]" },
  incomplete: { label: "Incomplet", className: "bg-[#F0F0EC] text-[#999]" },
  past_due: { label: "Paiement en retard", className: "bg-[#FDF3D9] text-[#8A6D1A]" },
  canceled: { label: "Annulé", className: "bg-[#FCEBEB] text-[#A32D2D]" },
  unpaid: { label: "Impayé", className: "bg-[#FCEBEB] text-[#A32D2D]" },
  aucun_abonnement: { label: "Aucun abonnement", className: "bg-[#F0F0EC] text-[#999]" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_LABELS[status] || { label: status, className: "bg-[#F0F0EC] text-[#999]" };
  return (
    <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export default function AdminAbonnementsPage() {
  const [items, setItems] = useState<AdminMerchantSubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customOfferTarget, setCustomOfferTarget] = useState<AdminMerchantSubscriptionItem | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMerchantSubscriptionsOverview();
      setItems(data);
    } catch (err) {
      console.error(err);
      setError("Impossible de charger les abonnements commerçants.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCustomOfferModal = (item: AdminMerchantSubscriptionItem) => {
    setCustomOfferTarget(item);
    setCustomAmount(item.customOfferAmountHtLabel ? String(item.customOfferAmountHtLabel).replace(/[^\d,.-]/g, "").replace(",", ".") : "");
    setCustomLabel(item.customOfferLabel || "");
  };

  const handleSaveCustomOffer = async () => {
    if (!customOfferTarget) return;
    const amountEuros = Number(customAmount.replace(",", "."));
    if (!Number.isFinite(amountEuros) || amountEuros <= 0) return;
    setSaving(true);
    setActionFeedback(null);
    try {
      await setMerchantCustomOffer(customOfferTarget.merchantUserId, Math.round(amountEuros * 100), customLabel.trim());
      setCustomOfferTarget(null);
      await load();
    } catch (err) {
      console.error(err);
      setActionFeedback("Impossible d’enregistrer le tarif négocié.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCustomOffer = async (item: AdminMerchantSubscriptionItem) => {
    if (!window.confirm(`Retirer le tarif négocié de ${item.merchantLabel} ?`)) return;
    setActionFeedback(null);
    try {
      await removeMerchantCustomOffer(item.merchantUserId);
      await load();
    } catch (err) {
      console.error(err);
      setActionFeedback("Impossible de retirer le tarif négocié.");
    }
  };

  return (
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto grid max-w-[1440px] gap-6">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1a1a1a]">Abonnements commerçants</h1>
          <p className="mt-1 text-[14px] text-[#666]">
            Un abonnement par compte commerçant, couvrant toutes ses enseignes. Stripe reste la source de vérité
            financière ; cette vue est un miroir en lecture seule. Un tarif négocié peut être fixé pour un
            commerçant multi-enseignes au lieu du catalogue standard.
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
                  <th className="px-4 py-3 font-medium">Commerçant</th>
                  <th className="px-4 py-3 font-medium">Enseignes</th>
                  <th className="px-4 py-3 font-medium">Offre</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Prochaine echeance</th>
                  <th className="px-4 py-3 font-medium">Parrainage</th>
                  <th className="px-4 py-3 font-medium">Tarif négocié</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[#999]">
                      Aucun abonnement commerçant pour le moment.
                    </td>
                  </tr>
                )}
                {items.map((item) => (
                  <tr key={item.merchantUserId} className="border-b border-[#F0F0EC] last:border-b-0 hover:bg-[#FCFCFB]">
                    <td className="px-4 py-3 font-medium text-[#1a1a1a]">{item.merchantLabel}</td>
                    <td className="px-4 py-3 text-[#666]">
                      {item.enseigneNames.length > 0 ? item.enseigneNames.join(", ") : "—"}
                      {item.enseigneNames.length > 1 ? (
                        <span className="ml-1 text-[11px] text-[#999]">({item.enseigneNames.length})</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[#666]">{item.offerId || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={item.subscriptionStatus} /></td>
                    <td className="px-4 py-3 text-[#666]">
                      {item.currentPeriodEndLabel || "—"}
                      {item.cancelAtPeriodEnd ? " (annulation programmée)" : ""}
                    </td>
                    <td className="px-4 py-3 text-[#666]">{item.hasReferral ? "Oui" : "—"}</td>
                    <td className="px-4 py-3">
                      {item.customOfferAmountHtLabel ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-[#1a1a1a]">{item.customOfferAmountHtLabel} HT/an</span>
                          <span className="text-[11px] text-[#999]">{item.customOfferLabel}</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => openCustomOfferModal(item)}
                              className="text-[11px] font-medium text-[#639922] underline"
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRemoveCustomOffer(item)}
                              className="text-[11px] font-medium text-[#E24B4A] underline"
                            >
                              Retirer
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openCustomOfferModal(item)}
                          className="rounded-[7px] border border-[#E0E0DA] bg-white px-3 py-1.5 text-[12px] font-medium text-[#666] hover:bg-[#F7F7F5]"
                        >
                          Fixer un tarif
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {customOfferTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-[12px] border border-[#E8E8E4] bg-white p-6 shadow-lg">
            <h3 className="text-[16px] font-medium text-[#1a1a1a]">
              Tarif négocié — {customOfferTarget.merchantLabel}
            </h3>
            <p className="mt-2 text-[13px] text-[#666]">
              Montant HT annuel. La TVA (20 %) est ajoutée automatiquement au paiement, comme pour le catalogue
              standard.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <label className="text-[12px] font-medium text-[#666]">Montant HT / an (EUR)</label>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[13px]"
                placeholder="Ex. 2500"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
              />
              <label className="mt-2 text-[12px] font-medium text-[#666]">Libelle (facultatif)</label>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[13px]"
                placeholder="Ex. Tarif 5 enseignes"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
              />
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setCustomOfferTarget(null)}
                className="flex-1 rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-2 text-[13px] text-[#666]"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={saving || !customAmount.trim()}
                onClick={() => void handleSaveCustomOffer()}
                className="flex-1 rounded-[8px] bg-[#639922] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
