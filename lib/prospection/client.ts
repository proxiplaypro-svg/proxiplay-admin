"use client";
import { auth } from "../firebase/auth";
export async function prospectRequest<T>(method = "GET", body?: unknown, id?: string): Promise<T> {
  await auth.authStateReady(); if (!auth.currentUser) throw new Error("Connexion admin requise.");
  const response = await fetch(`/api/admin/prospection${id ? `?id=${encodeURIComponent(id)}` : ""}`, { method, headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
  const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "L’opération a échoué."); return payload as T;
}
