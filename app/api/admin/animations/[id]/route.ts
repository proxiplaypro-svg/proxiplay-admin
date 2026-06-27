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
    const [entriesSnap, winnerSnap] = await Promise.all([
      db.collection("animations").doc(id).collection("entries").get(),
      db.collection("animations").doc(id).collection("winner").get(),
    ]);

    const batch = db.batch();

    entriesSnap.docs.forEach((doc) => batch.delete(doc.ref));
    winnerSnap.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(db.collection("animations").doc(id));

    const gamesSnapshot = await db
      .collection("games")
      .where("animation_id", "==", id)
      .get();

    gamesSnapshot.docs.forEach((gameDoc) => {
      batch.delete(gameDoc.ref);
    });

    await batch.commit();

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
