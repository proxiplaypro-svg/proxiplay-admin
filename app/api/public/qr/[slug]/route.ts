// Route PUBLIQUE des campagnes QR, atteinte par reecriture depuis le site :
// https://proxiplay.fr/bus et https://proxiplay.fr/c/<chemin>.
// Aucune authentification : elle ne fait que rediriger (302) et compter
// des ouvertures agregees APRES la reponse, via after() (Next.js, pris en
// charge par Vercel avec waitUntil).

import { after } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin-app";
import { createFirestoreQrStore } from "@/lib/qr/firestoreQrStore";
import { createQrRedirectHandler } from "@/lib/qr/qrRedirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Duree accordee au comptage apres la reponse (after()).
export const maxDuration = 10;

// Une instance par processus : cache des destinations (60 s) et plafonds.
// QR_BURST_WINDOW_MS=0 desactive la protection contre les rafales si
// l'adresse d'origine n'est pas transmise fidelement par la reecriture.
const burstWindowMs = Number(process.env.QR_BURST_WINDOW_MS ?? 30_000);
const handler = createQrRedirectHandler({
  store: createFirestoreQrStore(getAdminDb),
  burstWindowMs: Number.isFinite(burstWindowMs) && burstWindowMs >= 0 ? burstWindowMs : 30_000,
});

type Context = { params: Promise<{ slug: string }> };

async function redirect(request: Request, context: Context) {
  const { slug } = await context.params;
  const { response, task } = await handler.handle(request, slug);
  if (task) after(task);
  return response;
}

export const GET = redirect;
export const HEAD = redirect;
