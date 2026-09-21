import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";
import { ProspectService } from "@/lib/prospection/server";
import { parseFields, parseSearch, ProspectError, record, text } from "@/lib/prospection/model";
import { getProspectProvider } from "@/lib/prospection/provider";

export const runtime = "nodejs";
async function handle(request: Request) {
  try {
    const admin = await assertIsAdminRequest(request);
    const service = new ProspectService();
    const url = new URL(request.url); const id = url.searchParams.get("id");
    let result: unknown;
    if (request.method === "GET") result = id ? await service.detail(id) : { prospects: await service.list(), ignored: await service.ignored(), merchants: await service.merchants(), searchAvailable: Boolean(process.env.GOOGLE_PLACES_API_KEY) };
    else {
      const raw = await request.text(); if (raw.length > 1000000) throw new ProspectError("Requête trop volumineuse.", 413);
      let body: Record<string, unknown>; try { body = record(JSON.parse(raw)); } catch { throw new ProspectError("Requête JSON invalide."); }
      if (request.method === "DELETE") { if (!id) throw new ProspectError("Identifiant requis."); result = await service.remove(id, body.revision); }
      else if (request.method === "PATCH") { if (!id) throw new ProspectError("Identifiant requis."); result = await service.update(id, body, admin.uid); }
      else if (body.action === "ignore") result = await service.ignore(body.fields, admin.uid);
      else if (body.action === "reactivate") result = await service.reactivate(text(body.placeId));
      else if (body.action === "annotate") {
        if (!Array.isArray(body.selection) || body.selection.length > 50) throw new ProspectError("Sélection invalide.");
        result = { results: await service.annotate(body.selection.map(parseFields)) };
      }
      else if (body.action === "search") {
        if (body.onlyNew !== undefined && typeof body.onlyNew !== "boolean") throw new ProspectError("Mode de recherche invalide.");
        result = await service.discover(parseSearch(body), body.onlyNew === true, getProspectProvider());
      }
      else if (body.action === "details") {
        result = { results: await service.annotate([await getProspectProvider().getDetails(text(body.placeId))]) };
      } else if (body.action === "import") {
        if (!Array.isArray(body.selection)) throw new ProspectError("Sélection invalide.");
        result = await service.createMany(body.selection, admin.uid);
      } else if (body.action === "create") {
        const created = await service.createMany([body.fields], admin.uid);
        if (!created.created.length) throw new ProspectError(created.skipped[0]?.duplicate.kind === "client" ? "Déjà client Proxiplay" : created.skipped[0]?.duplicate.kind === "ignored" ? "Établissement ignoré : réactivez-le avant import." : "Prospect déjà présent ou doublon possible.", 409);
        result = created;
      } else throw new ProspectError("Action inconnue.");
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authError = handleAdminAuthError(error); if (authError) return authError;
    if (error && typeof error === "object" && "code" in error && String(error.code).startsWith("auth/")) return Response.json({ error: "Session invalide. Reconnectez-vous." }, { status: 401 });
    return Response.json({ error: error instanceof ProspectError ? error.message : "L’opération de prospection a échoué." }, { status: error instanceof ProspectError ? error.status : 500 });
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
