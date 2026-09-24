import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";
import { GooglePlacesProvider } from "@/lib/prospection/provider";
import { ProspectError } from "@/lib/prospection/model";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await assertIsAdminRequest(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.name !== "string" || typeof body.location !== "string") throw new ProspectError("Renseignez le nom et une ville ou adresse.");
    const provider = new GooglePlacesProvider(process.env.GOOGLE_PLACES_API_KEY || "");
    return Response.json({ results: await provider.findBusiness(body.name, body.location) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleAdminAuthError(error) || Response.json({ error: error instanceof ProspectError ? error.message : "La recherche Google a échoué." }, { status: error instanceof ProspectError ? error.status : 502 });
  }
}
