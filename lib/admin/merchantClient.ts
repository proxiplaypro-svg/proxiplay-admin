"use client";
import { auth } from "@/lib/firebase/auth";

export class MerchantRequestError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}
export async function merchantRequest(method: "GET" | "POST" | "PATCH", body?: unknown, merchantId?: string) {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Reconnectez-vous pour gérer les commerçants.");
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(`/api/admin/marchands${merchantId ? `?merchantId=${encodeURIComponent(merchantId)}` : ""}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  if (!response.ok) throw new MerchantRequestError(payload.error || "L’opération a échoué.", payload.code);
  return payload;
}
