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
    await assertIsAdminRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const { id, start_date, end_date, ...rest } = body;

    const db = getAdminDb();
    const ref =
      typeof id === "string" && id.trim()
        ? db.collection("animations").doc(id.trim())
        : db.collection("animations").doc();

    await ref.set({
      ...rest,
      ...(start_date !== undefined && { start_date: parseTimestamp(start_date) }),
      ...(end_date !== undefined && { end_date: parseTimestamp(end_date) }),
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[ANIMATION_CREATE]", error);
    return NextResponse.json(
      { error: "Impossible de creer l animation." },
      { status: 500 },
    );
  }
}
