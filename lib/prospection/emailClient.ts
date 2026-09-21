"use client";
import { httpsCallable } from "firebase/functions";
import { functionsClient } from "../firebase/functions";

export async function emailRequest<T = { success: boolean }>(data: Record<string, unknown>): Promise<T> {
  try {
    const result = await httpsCallable<Record<string, unknown>, T>(functionsClient, "prospectEmail", { timeout: 120000 })(data);
    return result.data;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "functions/not-found" || code === "functions/unavailable") throw new Error("Service email indisponible. La fonction Firebase prospectEmail doit être activée pour utiliser ce module.");
    throw error;
  }
}
export type EnrichmentBatch = { results: { id: string; status: string; count: number; error_code?: string }[]; found: number; not_found: number; failed: number; emails: number };
