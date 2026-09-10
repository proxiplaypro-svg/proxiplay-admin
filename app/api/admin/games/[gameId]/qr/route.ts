import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";
import { readSecureGameQr } from "@/lib/admin/secureGameQrServer";

export async function GET(request: Request, context: { params: Promise<{ gameId: string }> }) {
  try {
    await assertIsAdminRequest(request);
    const { gameId } = await context.params;
    if (!gameId || gameId.includes("/") || gameId.length > 150) return Response.json({ error: "Jeu invalide." }, { status: 400 });
    return Response.json(await readSecureGameQr(gameId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleAdminAuthError(error) ?? Response.json({ error: "Impossible de charger le QR sécurisé." }, { status: 500 });
  }
}
