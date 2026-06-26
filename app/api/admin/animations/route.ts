import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin-app";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { id, ...payload } = body;

    const db = getAdminDb();
    const ref =
      typeof id === "string" && id.trim()
        ? db.collection("animations").doc(id.trim())
        : db.collection("animations").doc();

    await ref.set({
      ...payload,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id });
  } catch (error) {
    console.error("[ANIMATION_CREATE]", error);
    return NextResponse.json(
      { error: "Impossible de creer l animation." },
      { status: 500 },
    );
  }
}
