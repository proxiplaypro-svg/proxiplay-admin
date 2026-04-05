"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertBanner } from "@/components/admin/AlertBanner";
import { GameRow } from "@/components/admin/GameRow";
import { KpiCard } from "@/components/admin/KpiCard";
import { MerchantsTable } from "@/components/admin/MerchantsTable";
import { NotificationsPanel } from "@/components/admin/NotificationsPanel";
import { QuickActions } from "@/components/admin/QuickActions";
import { sendBulkReminder } from "@/lib/firebase/adminActions";
import {
  exportActivePlayersCsv,
  subscribeDashboardData,
} from "@/lib/firebase/dashboardQueries";
import type { DashboardData, OperationsAlertItem } from "@/types/dashboard";

const initialData: DashboardData = {
  kpis: [],
  bannerAlerts: [],
  activeGames: [],
  sideAlerts: [],
  merchants: [],
  notifications: [],
  activePlayersExport: [],
};

function formatFrenchDate(date: Date) {
  const formatted = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function alertDotClassName(severity: OperationsAlertItem["severity"]) {
  switch (severity) {
    case "critical":
      return "bg-[#ef5454]";
    case "success":
      return "bg-[#73b225]";
    default:
      return "bg-[#dda12f]";
  }
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkReminderPending, setBulkReminderPending] = useState(false);
  const [bulkReminderFeedback, setBulkReminderFeedback] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeDashboardData(
      (nextData) => {
        setData(nextData);
        setLoading(false);
      },
      (subscriptionError) => {
        console.error(subscriptionError);
        setError("Impossible de synchroniser le dashboard en temps reel.");
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const todayLabel = useMemo(() => formatFrenchDate(new Date()), []);

  const handleExport = async () => {
    await exportActivePlayersCsv(data.activePlayersExport);
  };

  const handleBulkReminder = async () => {
    try {
      setBulkReminderPending(true);
      setBulkReminderFeedback(null);
      const result = await sendBulkReminder();
      setBulkReminderFeedback(`${result.remindedCount} marchands relances.`);
    } catch (actionError) {
      console.error(actionError);
      setBulkReminderFeedback("La relance groupee a echoue.");
    } finally {
      setBulkReminderPending(false);
    }
  };

  return (
    <section className="space-y-7 text-[#f1efeb]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.03em] text-[#f5f2ee]">
            Tableau de bord
          </h1>
          <p className="mt-2 text-xl text-[#9f9c97]">{todayLabel} - Dunkerque</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-[#eef7df] px-4 py-2 text-[#5b8b1f]">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#5d8d21]" />
            <span className="text-[15px] font-medium">Live</span>
          </div>

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={data.activePlayersExport.length === 0}
            className="rounded-[18px] border border-white/15 px-6 py-3 text-lg text-[#f2efeb] transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Exporter CSV
          </button>

          <Link
            href="/admin/jeux/nouveau"
            className="rounded-[18px] border border-[#77ad35] bg-[#1c3f0e] px-6 py-3 text-lg text-[#edf6e1] transition hover:bg-[#265712]"
          >
            + Nouveau jeu
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-[22px] border border-red-400/30 bg-red-500/10 px-5 py-4 text-[#ffb0b0]">
          {error}
        </div>
      ) : null}

      {bulkReminderFeedback ? (
        <div className="rounded-[22px] border border-white/10 bg-white/[0.04] px-5 py-4 text-[#d9d5cf]">
          {bulkReminderFeedback}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`skeleton-${index}`}
                className="h-[170px] animate-pulse rounded-[22px] border border-white/10 bg-white/[0.04]"
              />
            ))
          : data.kpis.map((item) => <KpiCard key={item.id} kpi={item} />)}
      </div>

      <AlertBanner alerts={data.bannerAlerts} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section className="overflow-hidden rounded-[26px] border border-white/10 bg-[#2f2e2a]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <h2 className="text-[18px] text-[#f3f1ed]">Jeux & campagnes actives</h2>
            <Link
              href="/admin/games"
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-[#ece8e3]"
            >
              Voir tous
            </Link>
          </div>
          <div className="divide-y divide-white/8 px-2 py-2">
            {data.activeGames.map((game) => (
              <GameRow key={game.id} game={game} />
            ))}
            {!loading && data.activeGames.length === 0 ? (
              <div className="px-5 py-10 text-[#a6a39d]">Aucun jeu actif a afficher.</div>
            ) : null}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-[24px] border border-white/10 bg-[#2f2e2a]">
            <div className="border-b border-white/10 px-5 py-4">
              <h3 className="text-[18px] text-[#f3f1ed]">Alertes & actions</h3>
            </div>
            <div className="space-y-4 p-5">
              {data.sideAlerts.map((alert) => (
                <div key={alert.id} className="border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <span className={`mt-2 h-3 w-3 rounded-full ${alertDotClassName(alert.severity)}`} />
                    <div>
                      <p className="text-[15px] font-medium text-[#f1efeb]">{alert.title}</p>
                      <p className="mt-1 text-[15px] leading-6 text-[#a7a39d]">{alert.description}</p>
                    </div>
                  </div>
                </div>
              ))}
              {!loading && data.sideAlerts.length === 0 ? (
                <p className="text-[#a6a39d]">Aucune alerte prioritaire.</p>
              ) : null}
            </div>
          </section>

          <QuickActions
            onBulkReminder={handleBulkReminder}
            isBulkReminderPending={bulkReminderPending}
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <MerchantsTable merchants={data.merchants} />
        <NotificationsPanel notifications={data.notifications} />
      </div>
    </section>
  );
}
