// Appels de la console vers /api/admin/qr-campaigns (jeton Firebase de
// l'administrateur connecte, verifie cote serveur).
import { auth } from "@/lib/firebase/auth";

export async function qrApi(url: string, options: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("Connexion administrateur requise.");
  const token = await user.getIdToken();
  return fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function qrApiError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error?.trim() || fallback;
}
