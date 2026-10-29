"use client";

import { useEffect, useState } from "react";
import LegacyDashboard from "@/components/admin/LegacyDashboard";
import ReliableDashboard from "@/components/admin/ReliableDashboard";
import { fetchReliableDashboard, type ReliableDashboardSnapshot } from "@/lib/firebase/reliableDashboardQueries";

// The consolidated dashboard replaces the former one by itself, as soon as the
// nightly consolidation has produced a complete result. Until then (function
// not deployed, failed run, statistics route unavailable) the former dashboard
// stays exactly where it is.
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
  if (reliable?.ready) return <ReliableDashboard data={reliable} />;
  return <LegacyDashboard />;
}
