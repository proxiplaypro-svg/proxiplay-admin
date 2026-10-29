"use client";

import { auth } from "@/lib/firebase/auth";
import type { ReliableDashboardSnapshot } from "@/lib/admin/reliableDashboard";

export type { ReliableDashboardSnapshot } from "@/lib/admin/reliableDashboard";

// Server route (Admin SDK): about 31 document reads per call, no client listener.
export async function fetchReliableDashboard(): Promise<ReliableDashboardSnapshot> {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Connexion admin requise.");
  const response = await fetch("/api/admin/dashboard-stats", {
    headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Statistiques indisponibles.");
  return (await response.json()) as ReliableDashboardSnapshot;
}
