import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";
import { loadMerchantCategories } from "@/lib/admin/merchantCategoriesServer";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await assertIsAdminRequest(request);
    return Response.json({ categories: await loadMerchantCategories() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleAdminAuthError(error) || Response.json({ error: "Impossible de charger les catégories." }, { status: 503 });
  }
}
