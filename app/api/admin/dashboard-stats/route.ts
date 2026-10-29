import { NextRequest, NextResponse } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin-app";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";
import { mapReliableDashboard } from "@/lib/admin/reliableDashboard";

// Consolidated dashboard: 1 summary document + at most 30 daily documents.
// Read with the Admin SDK so that the shared Firestore rules of the player app
// do not have to expose dashboard_stats or analytics_daily to any client.
export async function GET(request: NextRequest) {
  try {
    await assertIsAdminRequest(request);
    const db = getAdminDb();
    const [current, days] = await Promise.all([
      db.doc("dashboard_stats/current").get(),
      db.collection("analytics_daily").orderBy(FieldPath.documentId(), "desc").limit(30).get(),
    ]);
    const snapshot = mapReliableDashboard(
      current.exists ? (current.data() ?? null) : null,
      days.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
    );
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[DASHBOARD_STATS]", error);
    return NextResponse.json({ error: "Statistiques indisponibles." }, { status: 500 });
  }
}
