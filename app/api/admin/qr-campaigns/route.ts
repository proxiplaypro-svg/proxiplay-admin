import { NextRequest, NextResponse } from "next/server";
import { getQrDb } from "@/lib/qr/qrDb";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";
import { QrCampaignError, createQrCampaign, listQrCampaigns } from "@/lib/qr/qrCampaignAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  const authResponse = handleAdminAuthError(error);
  if (authResponse) return authResponse;
  if (error instanceof QrCampaignError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("[qr-campaigns]", error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await assertIsAdminRequest(request);
    return NextResponse.json({ campaigns: await listQrCampaigns(getQrDb()) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await assertIsAdminRequest(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Données invalides." }, { status: 400 });
    const campaign = await createQrCampaign(getQrDb(), body, admin.email ?? admin.uid);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
