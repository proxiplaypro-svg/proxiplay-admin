import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin-app";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";

type RequestBody = {
  prizeCount: number;
  gameStartMs: number;
  gameEndMs: number;
  secondaryPrizeName: string;
  secondaryPrizeDescription: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    await assertIsAdminRequest(request);
    const { gameId } = await params;
    const body = (await request.json()) as RequestBody;
    const { prizeCount, gameStartMs, gameEndMs, secondaryPrizeName, secondaryPrizeDescription } =
      body;

    const db = getAdminDb();
    const instantWinnersRef = db
      .collection("games")
      .doc(gameId)
      .collection("instant_winners");

    const existingSnapshot = await instantWinnersRef.where("hasWinner", "==", false).get();
    const existingCount = existingSnapshot.size;

    if (existingCount >= prizeCount) {
      return NextResponse.json({ created: 0 });
    }

    const missingCount = prizeCount - existingCount;
    const rangeMs = gameEndMs - gameStartMs;

    if (rangeMs <= 0) {
      return NextResponse.json({ created: 0 });
    }

    const batch = db.batch();

    for (let i = 0; i < missingCount; i++) {
      const randomOffset = Math.random() * rangeMs;
      const winnerDateMs = Math.round(gameStartMs + randomOffset);
      const ref = instantWinnersRef.doc();

      batch.set(ref, {
        hasWinner: false,
        date: Timestamp.fromMillis(winnerDateMs),
        secondary_prize_name: secondaryPrizeName,
        secondary_prize_presentation: secondaryPrizeDescription,
      });
    }

    await batch.commit();

    return NextResponse.json({ created: missingCount });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[INSTANT_WINNERS_CREATE]", error);
    return NextResponse.json(
      { error: "Impossible de generer les instant_winners." },
      { status: 500 },
    );
  }
}
