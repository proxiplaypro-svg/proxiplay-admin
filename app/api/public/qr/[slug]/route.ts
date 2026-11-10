// Route PUBLIQUE des campagnes QR, atteinte par reecriture depuis le site :
// https://proxiplay.fr/bus et https://proxiplay.fr/c/<chemin>.
// Aucune authentification : elle ne fait que rediriger (302) et compter
// des ouvertures agregees APRES la reponse, via after() (Next.js, pris en
// charge par Vercel avec waitUntil).

import { after } from "next/server";
import { getQrDb } from "@/lib/qr/qrDb";
import { createFirestoreQrStore } from "@/lib/qr/firestoreQrStore";
import { burstKey, createQrRedirectHandler } from "@/lib/qr/qrRedirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Duree accordee au comptage apres la reponse (after()).
export const maxDuration = 10;

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

// Hors production uniquement : reglages de verification (Vercel Preview).
const isProduction = process.env.VERCEL_ENV === "production";
const debugHeaders = !isProduction && process.env.QR_DEBUG_HEADERS === "1";

// Une instance par processus : cache des destinations (60 s) et plafonds.
// QR_BURST_WINDOW_MS=0 desactive la protection contre les rafales si
// l'adresse d'origine n'est pas transmise fidelement par la reecriture.
const handler = createQrRedirectHandler({
  store: createFirestoreQrStore(getQrDb),
  burstWindowMs: boundedNumber(process.env.QR_BURST_WINDOW_MS, 30_000, 0, 3_600_000),
  // QR_RESOLVE_TIMEOUT_MS (hors production) simule une base lente.
  resolveTimeoutMs: isProduction ? 500 : boundedNumber(process.env.QR_RESOLVE_TIMEOUT_MS, 500, 1, 2_000),
});

type Context = { params: Promise<{ slug: string }> };

async function redirect(request: Request, context: Context) {
  const { slug } = await context.params;
  const result = await handler.handle(request, slug);
  if (result.task) after(result.task);
  if (!debugHeaders) return result.response;
  // Diagnostic Preview : resultat, empreinte tronquee de l'origine (jamais
  // l'adresse) et nombre d'adresses transmises par les proxys.
  const response = new Response(null, { status: result.response.status, headers: result.response.headers });
  response.headers.set("x-qr-outcome", result.outcome);
  response.headers.set("x-qr-fallback", String(result.fallback));
  response.headers.set("x-qr-origin", (await burstKey(slug, request))?.slice(0, 8) ?? "none");
  response.headers.set("x-qr-forwarded-count", String(request.headers.get("x-forwarded-for")?.split(",").length ?? 0));
  return response;
}

export const GET = redirect;
export const HEAD = redirect;
