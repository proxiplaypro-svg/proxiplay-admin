import { NextRequest, NextResponse } from "next/server";
import { getQrDb } from "@/lib/qr/qrDb";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";
import { QrCampaignError, getQrCampaign, listQrCampaignChanges, updateQrCampaign } from "@/lib/qr/qrCampaignAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function failure(error: unknown) {
  const authResponse = handleAdminAuthError(error);
  if (authResponse) return authResponse;
  if (error instanceof QrCampaignError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("[qr-campaigns]", error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
}

export async function GET(request: NextRequest, context: Context) {
  try {
    await assertIsAdminRequest(request);
    const { id } = await context.params;
    const db = getQrDb();
    const campaign = await getQrCampaign(db, id);
    return NextResponse.json({ campaign, changes: await listQrCampaignChanges(db, id) });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const admin = await assertIsAdminRequest(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Données invalides." }, { status: 400 });
    const campaign = await updateQrCampaign(getQrDb(), id, body, admin.email ?? admin.uid);
    return NextResponse.json({ campaign });
  } catch (error) {
    return failure(error);
  }
}
