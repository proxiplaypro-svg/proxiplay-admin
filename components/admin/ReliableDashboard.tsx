"use client";

import Link from "next/link";
import type { ReliableDashboardMetricKey, ReliableDashboardSnapshot } from "@/lib/admin/reliableDashboard";

const labels: Array<[ReliableDashboardMetricKey, string]> = [
  ["registeredPlayers", "Joueurs inscrits"], ["playersYesterday", "Joueurs hier"],
  ["participationsYesterday", "Parties hier"],
  ["merchantsWithActiveGame", "Enseignes avec jeu en cours"], ["activeGames", "Jeux en cours"],
];

function DailyChart({ title, color, values }: { title: string; color: string; values: Array<{ day: string; value: number }> }) {
  const maximum = Math.max(1, ...values.map((item) => item.value));
  return <section className="rounded-xl border border-[#E8E8E4] bg-white p-4"><h2 className="text-base font-medium">{title}</h2><p className="mt-1 text-xs text-[#777]">30 dernières journées civiles closes — Europe/Paris.</p><div className="mt-5 flex h-44 items-end gap-1">{values.map((item) => <div key={item.day} className="group flex min-w-0 flex-1 flex-col justify-end" title={`${item.day} : ${item.value.toLocaleString("fr-FR")}`}><div className="rounded-t" style={{ height: `${Math.max(2, item.value / maximum * 100)}%`, backgroundColor: color }} /><span className="mt-1 truncate text-[9px] text-[#777]">{item.day.slice(8)}</span></div>)}</div>{values.length === 0 ? <p className="py-8 text-sm text-[#777]">Donnée indisponible.</p> : null}</section>;
}

export default function ReliableDashboard({ data }: { data: ReliableDashboardSnapshot }) {
  const players = data.daily.flatMap((item) => item.uniquePlayers === null ? [] : [{ day: item.day, value: item.uniquePlayers }]); const plays = data.daily.flatMap((item) => item.participations === null ? [] : [{ day: item.day, value: item.participations }]);
  return <section className="space-y-5 text-[#1A1A1A]"><header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-[22px] font-medium">Tableau de bord</h1><p className="mt-1 text-[13px] text-[#777]">{data.referenceDate ? `Statistiques arrêtées au ${data.referenceDate.split("-").reverse().join("/")}.` : "Statistiques en attente de consolidation"}</p></div><Link href="/admin/dashboard/complet" className="text-[13px] text-[#3B6D11] underline">Alertes, jeux et marchands à relancer</Link></header><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{labels.map(([key, label]) => <article key={key} className="rounded-xl border border-[#E8E8E4] bg-white p-4"><p className="text-xs text-[#777]">{label}</p><strong className="mt-2 block text-2xl">{data.metrics[key] !== null ? data.metrics[key]!.toLocaleString("fr-FR") : "Donnée indisponible"}</strong></article>)}</div><div className="grid gap-5 xl:grid-cols-2"><DailyChart title="Joueurs quotidiens" color="#2F6FED" values={players} /><DailyChart title="Parties quotidiennes" color="#639922" values={plays} /></div></section>;
}
