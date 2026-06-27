import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin-app";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertIsAdminRequest(request);
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const db = getAdminDb();

    await db.collection("animations").doc(id).update({
      ...body,
      updated_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[ANIMATION_UPDATE]", error);
    return NextResponse.json(
      { error: "Impossible de mettre a jour l animation." },
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

    // Supprimer les sous-collections (Firestore ne le fait pas automatiquement)
    const [entriesSnap, winnerSnap, gamesSnapshot] = await Promise.all([
      db.collection("animations").doc(id).collection("entries").get(),
      db.collection("animations").doc(id).collection("winner").get(),
      db.collection("games").where("animation_id", "==", id).get(),
    ]);

    // Chunked delete : batch Firestore limité à 500 opérations
    const CHUNK = 490;
    const allRefs = [
      ...entriesSnap.docs.map((d) => d.ref),
      ...winnerSnap.docs.map((d) => d.ref),
      ...gamesSnapshot.docs.map((d) => d.ref),
      db.collection("animations").doc(id),
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
    console.error("[ANIMATION_DELETE]", error);
    return NextResponse.json(
      { error: "Impossible de supprimer l animation." },
      { status: 500 },
    );
  }
}
