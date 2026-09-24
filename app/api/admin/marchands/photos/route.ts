import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";
import { MerchantPhotoService } from "@/lib/admin/merchantPhotosServer";
import { MerchantError } from "@/lib/admin/merchantSchema";
export const runtime = "nodejs";
export const maxDuration = 60;
async function handle(request: Request) {
  try {
    await assertIsAdminRequest(request);
    const id = new URL(request.url).searchParams.get("merchantId") || "";
    const service = new MerchantPhotoService();
    if (Number(request.headers.get("content-length") || 0) > 4 * 1024 * 1024) throw new MerchantError("Photos trop volumineuses.", 413);
    const result = request.method === "GET" ? await service.read(id) : await service.save(id, await request.formData());
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleAdminAuthError(error) || Response.json({ error: error instanceof MerchantError ? error.message : "Impossible d’enregistrer les photos. Vous pouvez réessayer." }, { status: error instanceof MerchantError ? error.status : 500 });
  }
}
export const GET = handle;
export const POST = handle;
