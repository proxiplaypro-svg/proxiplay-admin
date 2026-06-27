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
    // La borne inférieure est max(gameStart, maintenant) pour éviter des dates
    // déjà passées au moment de la création (ex: animation qui démarre aujourd'hui).
    const effectiveStartMs = Math.max(gameStartMs, Date.now());
    const effectiveRangeMs = gameEndMs - effectiveStartMs;

    if (effectiveRangeMs <= 0) {
      return NextResponse.json({ created: 0 });
    }

    const batch = db.batch();

    for (let i = 0; i < missingCount; i++) {
      const randomOffset = Math.random() * effectiveRangeMs;
      const winnerDateMs = Math.round(effectiveStartMs + randomOffset);
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
