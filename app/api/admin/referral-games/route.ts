import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin-app";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";

function parseTimestamp(value: unknown): Timestamp | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const seconds = typeof obj.seconds === "number" ? obj.seconds : null;
  const nanoseconds = typeof obj.nanoseconds === "number" ? obj.nanoseconds : 0;
  if (seconds === null) return null;
  return new Timestamp(seconds, nanoseconds);
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await assertIsAdminRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const { start_date, end_date, enseigne_id, ...rest } = body;

    const startTimestamp = parseTimestamp(start_date);
    const endTimestamp = parseTimestamp(end_date);
    if (!startTimestamp || !endTimestamp) {
      return NextResponse.json(
        { error: "start_date et end_date sont requis." },
        { status: 400 },
      );
    }
    if (startTimestamp.toMillis() >= endTimestamp.toMillis()) {
      return NextResponse.json(
        { error: "start_date doit etre avant end_date." },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    const ref = db.collection("referral_games").doc();
    // enseigne_id est facultatif : simple id de document (pas un chemin),
    // converti ici en vraie DocumentReference Firestore — meme convention
    // que GamesRecord.enseigneId cote app joueur, absent du document si
    // aucun commercant partenaire n'est selectionne.
    const enseigneId = typeof enseigne_id === "string" ? enseigne_id.trim() : "";

    await ref.set({
      ...rest,
      status: "draft",
      start_date: startTimestamp,
      end_date: endTimestamp,
      ...(enseigneId ? { enseigne_id: db.collection("enseignes").doc(enseigneId) } : {}),
      ticket_count: 0,
      created_by: decodedToken.email ?? decodedToken.uid,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[REFERRAL_GAME_CREATE]", error);
    return NextResponse.json(
      { error: "Impossible de creer le jeu de parrainage." },
      { status: 500 },
    );
  }
}
