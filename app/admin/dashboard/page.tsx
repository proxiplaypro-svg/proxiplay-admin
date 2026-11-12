"use client";

import { useEffect, useState } from "react";
import ReliableDashboard from "@/components/admin/ReliableDashboard";
import { fetchReliableDashboard, type ReliableDashboardSnapshot } from "@/lib/firebase/reliableDashboardQueries";

const unavailableDashboard: ReliableDashboardSnapshot = {
  ready: false, referenceDate: null, referenceIsYesterday: false, weeklyPeriod: null, monthlyPeriod: null, daily: [],
  metrics: {
    registeredPlayers: null, uniquePlayersYesterday: null, uniquePlayersLastWeek: null, uniquePlayersLastMonth: null,
    inactivePlayersLastMonth: null, participationsYesterday: null,
    participationsSinceLaunch: null, activeGames: null,
  },
};

export default function AdminDashboardPage() {
  const [reliable, setReliable] = useState<ReliableDashboardSnapshot | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    fetchReliableDashboard()
      .then((snapshot) => { if (active) setReliable(snapshot); })
      .catch(() => { if (active) setReliable(null); });
    return () => { active = false; };
  }, []);

  if (reliable === undefined) return <p role="status" className="text-sm text-[#777]">Chargement du tableau de bord…</p>;
  return <ReliableDashboard data={reliable ?? unavailableDashboard} />;
}
