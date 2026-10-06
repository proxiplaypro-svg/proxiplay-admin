"use client";

import { useEffect, useState } from "react";
import {
  getMerchantSubscriptionsOverview,
  type AdminMerchantSubscriptionItem,
} from "@/lib/firebase/merchantBillingQueries";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: "Actif", className: "bg-[#EAF3DE] text-[#3B6D11]" },
  trialing: { label: "Essai", className: "bg-[#EAF3DE] text-[#3B6D11]" },
  incomplete: { label: "Incomplet", className: "bg-[#F0F0EC] text-[#999]" },
  past_due: { label: "Paiement en retard", className: "bg-[#FDF3D9] text-[#8A6D1A]" },
  canceled: { label: "Annule", className: "bg-[#FCEBEB] text-[#A32D2D]" },
  unpaid: { label: "Impaye", className: "bg-[#FCEBEB] text-[#A32D2D]" },
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getMerchantSubscriptionsOverview();
        if (!cancelled) setItems(data);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Impossible de charger les abonnements commercants.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto grid max-w-[1440px] gap-6">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1a1a1a]">Abonnements commercants</h1>
          <p className="mt-1 text-[14px] text-[#666]">
            Suivi Stripe des abonnements annuels par enseigne. Stripe reste la source de verite financiere ;
            cette vue est un miroir en lecture seule.
          </p>
        </div>

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
                  <th className="px-4 py-3 font-medium">Enseigne</th>
                  <th className="px-4 py-3 font-medium">Offre</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Prochaine echeance</th>
                  <th className="px-4 py-3 font-medium">Renouvellement</th>
                  <th className="px-4 py-3 font-medium">Parrainage</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#999]">
                      Aucun abonnement commercant pour le moment.
                    </td>
                  </tr>
                )}
                {items.map((item) => (
                  <tr key={item.enseigneId} className="border-b border-[#F0F0EC] last:border-b-0 hover:bg-[#FCFCFB]">
                    <td className="px-4 py-3 font-medium text-[#1a1a1a]">{item.enseigneName}</td>
                    <td className="px-4 py-3 text-[#666]">{item.offerId || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={item.subscriptionStatus} /></td>
                    <td className="px-4 py-3 text-[#666]">{item.currentPeriodEndLabel || "—"}</td>
                    <td className="px-4 py-3 text-[#666]">
                      {item.cancelAtPeriodEnd ? "Annulation programmee" : "Automatique"}
                    </td>
                    <td className="px-4 py-3 text-[#666]">{item.hasReferral ? "Oui" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
