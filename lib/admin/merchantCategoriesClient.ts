"use client";
import { auth } from "@/lib/firebase/auth";
import type { MerchantCategory } from "./merchantCategories";

export async function fetchMerchantCategories(): Promise<MerchantCategory[]> {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Session requise.");
  const token = await auth.currentUser.getIdToken();
  const response = await fetch("/api/admin/marchands/categories", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error("Impossible de charger les catégories.");
  return (await response.json()).categories;
}
