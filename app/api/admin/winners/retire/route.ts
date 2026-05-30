import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin-app";

type MarkWinnersAsRetiredBody = {
  prizeIds?: string[];
};

function normalizePrizeIds(prizeIds: string[] | undefined) {
  return [...new Set((prizeIds ?? []).map((prizeId) => prizeId.trim()).filter(Boolean))];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MarkWinnersAsRetiredBody;
    const prizeIds = normalizePrizeIds(body.prizeIds);

    if (prizeIds.length === 0) {
      return NextResponse.json({ error: "Aucun lot a mettre a jour." }, { status: 400 });
    }

    const batch = adminDb.batch();

    prizeIds.forEach((prizeId) => {
      batch.update(adminDb.collection("prizes").doc(prizeId), {
        status: "retire",
        claimed: true,
        claimed_at: FieldValue.serverTimestamp(),
        redeemed_at: FieldValue.serverTimestamp(),
        retiredAt: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    return NextResponse.json({
      updatedCount: prizeIds.length,
    });
  } catch (error) {
    console.error("Winner retire update failed", error);

    return NextResponse.json(
      { error: "Impossible de marquer ce ou ces lots comme retires pour le moment." },
      { status: 500 },
    );
  }
}
