"use client";

import type { ReliableDashboardMetricKey, ReliableDashboardSnapshot } from "@/lib/admin/reliableDashboard";

const cards: Array<{ key: ReliableDashboardMetricKey; label: string; period?: "week" | "month" }> = [
  { key: "registeredPlayers", label: "Joueurs inscrits" },
  { key: "uniquePlayersLastWeek", label: "Joueurs uniques", period: "week" },
  { key: "uniquePlayersLastMonth", label: "Joueurs uniques", period: "month" },
  { key: "inactivePlayersLastMonth", label: "Joueurs inactifs", period: "month" },
  { key: "participationsYesterday", label: "Parties jouées hier" },
  { key: "participationsSinceLaunch", label: "Parties jouées depuis le lancement" },
  { key: "activeGames", label: "Jeux en cours" },
];

function formatPeriod(period: { start: string; end: string } | null) {
  if (!period) return "Période indisponible";
  const format = (value: string) => value.split("-").reverse().join("/");
  return `Du ${format(period.start)} au ${format(period.end)} exclu`;
}

export default function ReliableDashboard({ data }: { data: ReliableDashboardSnapshot }) {
  return <section className="space-y-5 text-[#1A1A1A]">
    <header><h1 className="text-[22px] font-medium">Tableau de bord</h1></header>
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-3">
      {cards.map(({ key, label, period }) => {
        const value = data.metrics[key];
        const dateRange = period === "week" ? data.weeklyPeriod : period === "month" ? data.monthlyPeriod : null;
        return <article key={key} className="rounded-xl border border-[#E8E8E4] bg-white p-4">
          <p className="text-xs text-[#777]">{label}</p>
          <strong className="mt-2 block text-2xl font-medium">{value === null ? "Indisponible" : value.toLocaleString("fr-FR")}</strong>
          {period ? <p className="mt-2 text-xs text-[#777]">{formatPeriod(dateRange)}</p> : null}
        </article>;
      })}
    </div>
  </section>;
}
