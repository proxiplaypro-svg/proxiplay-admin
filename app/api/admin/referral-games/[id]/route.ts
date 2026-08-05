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

const kAllowedStatuses = new Set(["draft", "active", "ended"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertIsAdminRequest(request);
    const { id } = await params;
    const { start_date, end_date, status, ...rest } = (await request.json()) as Record<
      string,
      unknown
    >;
    const db = getAdminDb();

    if (status !== undefined && !kAllowedStatuses.has(String(status))) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }

    if (status === "active") {
      // Un seul jeu de parrainage actif a la fois : evite les tickets
      // ambigus si un admin en activait deux simultanement par erreur.
      const otherActiveSnap = await db
        .collection("referral_games")
        .where("status", "==", "active")
        .get();
      const otherActiveIds = otherActiveSnap.docs
        .map((doc) => doc.id)
        .filter((docId) => docId !== id);
      if (otherActiveIds.length > 0) {
        return NextResponse.json(
          {
            error:
              "Un autre jeu de parrainage est deja actif. Terminez-le avant d'en activer un nouveau.",
          },
          { status: 409 },
        );
      }
    }

    await db
      .collection("referral_games")
      .doc(id)
      .update({
        ...rest,
        ...(status !== undefined && { status }),
        ...(start_date !== undefined && { start_date: parseTimestamp(start_date) }),
        ...(end_date !== undefined && { end_date: parseTimestamp(end_date) }),
        updated_at: FieldValue.serverTimestamp(),
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[REFERRAL_GAME_UPDATE]", error);
    return NextResponse.json(
      { error: "Impossible de mettre a jour le jeu de parrainage." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertIsAdminRequest(request);
    const { id } = await params;
    const db = getAdminDb();

    const [entriesSnap, prizesSnap] = await Promise.all([
      db.collection("referral_games").doc(id).collection("entries").get(),
      db.collection("prizes").where("referral_game_id", "==", id).get(),
    ]);

    const CHUNK = 490;
    const allRefs = [
      ...entriesSnap.docs.map((d) => d.ref),
      ...prizesSnap.docs.map((d) => d.ref),
      db.collection("referral_games").doc(id),
    ];

    for (let i = 0; i < allRefs.length; i += CHUNK) {
      const batch = db.batch();
      allRefs.slice(i, i + CHUNK).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[REFERRAL_GAME_DELETE]", error);
    return NextResponse.json(
      { error: "Impossible de supprimer le jeu de parrainage." },
      { status: 500 },
    );
  }
}
