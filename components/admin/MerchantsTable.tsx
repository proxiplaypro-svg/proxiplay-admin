"use client";

import { useRouter } from "next/navigation";
import type { MerchantTableRow } from "@/types/dashboard";

const statusClassNames: Record<MerchantTableRow["status"], string> = {
  actif: "bg-[#e3f0cf] text-[#557d1d]",
  expire_bientot: "bg-[#f8e7e7] text-[#bd5858]",
  prive: "bg-[#dfeafb] text-[#3d74b4]",
  a_corriger: "bg-[#f8e7e7] text-[#bd5858]",
};

const statusLabels: Record<MerchantTableRow["status"], string> = {
  actif: "actif",
  expire_bientot: "expire bientot",
  prive: "prive",
  a_corriger: "a corriger",
};

export function MerchantsTable({ merchants }: { merchants: MerchantTableRow[] }) {
  const router = useRouter();

  return (
    <section className="rounded-[24px] border border-white/10 bg-[#2f2e2a]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h3 className="text-[18px] text-[#f3f1ed]">Marchands - suivi d activite</h3>
        <button
          type="button"
          onClick={() => router.push("/admin/commercants")}
          className="rounded-full border border-white/20 px-4 py-2 text-sm text-[#edeae6]"
        >
          Gerer
        </button>
      </div>

      <div className="overflow-x-auto px-5 py-4">
        <table className="w-full min-w-[560px] text-left text-sm text-[#d9d6d2]">
          <thead className="text-[#8f8c87]">
            <tr className="border-b border-white/10">
              <th className="pb-3 font-normal">Nom</th>
              <th className="pb-3 font-normal">Jeux actifs</th>
              <th className="pb-3 font-normal">Parties J30</th>
              <th className="pb-3 font-normal">Statut</th>
              <th className="pb-3 text-right font-normal">Action</th>
            </tr>
          </thead>
          <tbody>
            {merchants.map((merchant) => (
              <tr key={merchant.id} className="border-b border-white/10 last:border-b-0">
                <td className="py-4 text-[16px] text-[#f1efeb]">{merchant.name}</td>
                <td className="py-4">{merchant.activeGames}</td>
                <td className="py-4">{merchant.sessionsLast30d}</td>
                <td className="py-4">
                  <span className={`rounded-full px-3 py-2 text-sm ${statusClassNames[merchant.status]}`}>
                    {statusLabels[merchant.status]}
                  </span>
                </td>
                <td className="py-4 text-right">
                  <button
                    type="button"
                    onClick={() => router.push(merchant.actionHref)}
                    className="text-[#a7a39d] transition hover:text-white"
                  >
                    {merchant.actionLabel} →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
