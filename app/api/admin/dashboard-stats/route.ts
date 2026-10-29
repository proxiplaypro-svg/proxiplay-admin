import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin-app";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";
import { dailyDocumentIds, mapReliableDashboard } from "@/lib/admin/reliableDashboard";

// Consolidated dashboard: 1 summary document + at most 30 daily documents.
// Read with the Admin SDK so that the shared Firestore rules of the player app
// do not have to expose dashboard_stats or analytics_daily to any client.
// The daily documents are read by id (no ordered query, hence no index).
export async function GET(request: NextRequest) {
  try {
    await assertIsAdminRequest(request);
    const db = getAdminDb();
    const current = await db.doc("dashboard_stats/current").get();
    const data = current.exists ? (current.data() ?? null) : null;
    const ids = dailyDocumentIds(typeof data?.reference_date === "string" ? data.reference_date : null);
    const days = ids.length ? await db.getAll(...ids.map((id) => db.doc(`analytics_daily/${id}`))) : [];
    const snapshot = mapReliableDashboard(
      data,
      days.filter((doc) => doc.exists).map((doc) => ({ id: doc.id, data: doc.data() ?? {} })),
    );
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[DASHBOARD_STATS]", error);
    return NextResponse.json({ error: "Statistiques indisponibles." }, { status: 500 });
  }
}
