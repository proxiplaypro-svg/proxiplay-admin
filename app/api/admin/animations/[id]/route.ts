import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin-app";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const db = getAdminDb();

    await db.collection("animations").doc(id).update({
      ...body,
      updated_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ANIMATION_UPDATE]", error);
    return NextResponse.json(
      { error: "Impossible de mettre a jour l animation." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = getAdminDb();
    const batch = db.batch();

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
    console.error("[ANIMATION_DELETE]", error);
    return NextResponse.json(
      { error: "Impossible de supprimer l animation." },
      { status: 500 },
    );
  }
}
