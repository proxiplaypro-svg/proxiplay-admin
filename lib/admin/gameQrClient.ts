"use client";

import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import { auth } from "@/lib/firebase/auth";
import { db, firebaseApp } from "@/lib/firebase/client-app";
import { buildSecureGameQrLink, QR_REGENERATION_MESSAGE } from "./secureGameQr";

export type GameQrState = { state: "ready" | "public" | "not-found" | "ended" | "regeneration-required"; url?: string };

export async function readGameQr(gameId: string): Promise<GameQrState> {
  if (!auth.currentUser) throw new Error("Connexion admin requise.");
  const response = await fetch(`/api/admin/games/${encodeURIComponent(gameId)}/qr`, {
    headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error("Impossible de charger le QR sécurisé. Réessayez après vérification de votre connexion admin.");
  return response.json();
}

export async function issueGameQr(gameId: string) {
  // Engine export has no .region(): Firebase's default region, as in the mobile client.
  const issue = httpsCallable<{ gameId: string }, { token: string }>(getFunctions(firebaseApp), "issueGameQrAccess");
  const result = await issue({ gameId }); // Never rotate an existing valid QR.
  return buildSecureGameQrLink(gameId, result.data.token);
}

export async function resolveGameQrLink(gameId: string, publicLink: string) {
  const game = await getDoc(doc(db, "games", gameId));
  if (!game.exists()) {
    const legacy = await getDoc(doc(db, "jeux", gameId));
    if (legacy.data()?.access_mode === "qr_only") throw new Error("Ce jeu QR-only historique doit être repris dans le mécanisme sécurisé avec autorisation. Aucun QR générique ne sera exporté.");
    return publicLink;
  }
  if (game.data().access_mode !== "qr_only") return publicLink;
  const result = await readGameQr(gameId);
  if (result.state === "ready" && result.url) return result.url;
  throw new Error(result.state === "ended" ? "Ce jeu est terminé ou désactivé." : QR_REGENERATION_MESSAGE);
}
