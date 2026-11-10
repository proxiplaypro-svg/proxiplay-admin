import { NextRequest, NextResponse } from "next/server";
import { getQrDb } from "@/lib/qr/qrDb";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";
import { QrCampaignError, getQrCampaignStats } from "@/lib/qr/qrCampaignAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    await assertIsAdminRequest(request);
    const { id } = await context.params;
    const from = request.nextUrl.searchParams.get("from") ?? "";
    const to = request.nextUrl.searchParams.get("to") ?? "";
    return NextResponse.json({ stats: await getQrCampaignStats(getQrDb(), id, from, to) });
  } catch (error) {
    const authResponse = handleAdminAuthError(error);
    if (authResponse) return authResponse;
    if (error instanceof QrCampaignError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[qr-campaigns/stats]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
