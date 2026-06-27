import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin-app";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";

type MarkWinnersAsRetiredBody = {
  prizeIds?: string[];
};

function normalizePrizeIds(prizeIds: string[] | undefined) {
  return [...new Set((prizeIds ?? []).map((prizeId) => prizeId.trim()).filter(Boolean))];
}

export async function POST(request: Request) {
  try {
    const decodedToken = await assertIsAdminRequest(request);
    const adminDb = getAdminDb();
    const body = (await request.json()) as MarkWinnersAsRetiredBody;
    const prizeIds = normalizePrizeIds(body.prizeIds);

    console.info("[ADMIN_WINNER_MARK_CLAIMED_START]", {
      adminEmail: decodedToken.email ?? null,
      prizeIds,
    });

    if (prizeIds.length === 0) {
      return NextResponse.json({ error: "Aucun lot a mettre a jour." }, { status: 400 });
    }

    const batch = adminDb.batch();

    prizeIds.forEach((prizeId) => {
      batch.update(adminDb.collection("prizes").doc(prizeId), {
        status: "claimed",
        claimed: true,
        claimed_by_admin: true,
        claimed_at: FieldValue.serverTimestamp(),
        redeemed_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    console.info("[ADMIN_WINNER_MARK_CLAIMED_SUCCESS]", {
      adminEmail: decodedToken.email ?? null,
      updatedCount: prizeIds.length,
      prizeIds,
    });

    return NextResponse.json({
      updatedCount: prizeIds.length,
    });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;

    console.error("[ADMIN_WINNER_MARK_CLAIMED_ERROR]", error);

    return NextResponse.json(
      { error: "Impossible de marquer ce ou ces lots comme retires pour le moment." },
      { status: 500 },
    );
  }
}
