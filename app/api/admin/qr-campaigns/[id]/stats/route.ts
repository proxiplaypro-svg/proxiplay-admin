import { NextRequest, NextResponse } from "next/server";
import { getQrDb } from "@/lib/qr/qrDb";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";
import { getQrCampaignStats, qrCampaignErrorResponse } from "@/lib/qr/qrCampaignAdmin";

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
    return qrCampaignErrorResponse(error, handleAdminAuthError, "qr-campaigns/stats");
  }
}
