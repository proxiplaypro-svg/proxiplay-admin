"use client";
import { auth } from "@/lib/firebase/auth";
export async function merchantMediaRequest(path: string, body?: unknown) {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Reconnectez-vous.");
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(`/api/admin/marchands/${path}`, {
    method: body ? "POST" : "GET", cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "L’opération a échoué.");
  return data;
}
export async function uploadMerchantGallery(id: string, form: FormData, progress: (percent: number) => void) {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Reconnectez-vous.");
  const token = await auth.currentUser.getIdToken();
  return new Promise<import("./merchantPhotos").PhotoGallery & { cleanupWarning?: boolean }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/marchands/photos?merchantId=${encodeURIComponent(id)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`); xhr.timeout = 90000;
    xhr.upload.onprogress = event => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
    xhr.onerror = xhr.ontimeout = () => reject(new Error("L’enregistrement des photos n’a pas pu être confirmé. Réessayez sans recréer le commerce."));
    xhr.onload = () => {
      try { const result = JSON.parse(xhr.responseText); if (xhr.status >= 200 && xhr.status < 300) resolve(result); else reject(new Error(result.error || "Échec de l’enregistrement des photos.")); }
      catch { reject(new Error("Réponse photos invalide. Réessayez.")); }
    };
    xhr.send(form);
  });
}
