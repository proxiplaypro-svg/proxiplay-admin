import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin-app";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";

const legacy = "app_config/monthly_challenge";
const stamp = (value: unknown) => { const v = value as { seconds?: unknown; nanoseconds?: unknown } | null; return typeof v?.seconds === "number" ? new Timestamp(v.seconds, typeof v.nanoseconds === "number" ? v.nanoseconds : 0) : null; };
const day = (value: Timestamp) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(value.toDate());
const parisMidnightAfter = (dayKey: string) => {
  const [year, month, date] = dayKey.split("-").map(Number); const next = new Date(Date.UTC(year, month - 1, date + 1, 12));
  const nextDay = next.toISOString().slice(0, 10); const [nextYear, nextMonth, nextDate] = nextDay.split("-").map(Number); const utc = Date.UTC(nextYear, nextMonth - 1, nextDate);
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "longOffset" }).formatToParts(new Date(utc)).find((part) => part.type === "timeZoneName")?.value ?? "GMT"; const match = /GMT([+-])(\d{2}):(\d{2})/.exec(zone); const offset = match ? (Number(match[2]) * 60 + Number(match[3])) * 60000 * (match[1] === "+" ? 1 : -1) : 0;
  return Timestamp.fromMillis(utc - offset);
};

export async function GET(request: NextRequest) {
  try { await assertIsAdminRequest(request); const db = getAdminDb(); const type = request.nextUrl.searchParams.get("type") === "restaurant" ? "restaurant" : "attendance"; const month = request.nextUrl.searchParams.get("month"); const snap = month ? await db.collection("monthly_challenges").doc(type === "restaurant" ? `restaurant_${month}` : month).get() : await db.doc(legacy).get(); return NextResponse.json({ config: snap.exists ? snap.data() : null }); } catch (error) { return handleAdminAuthError(error) ?? NextResponse.json({ error: "Impossible de charger la configuration." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await assertIsAdminRequest(request); const body = await request.json() as Record<string, unknown>; const type = body.type === "restaurant" ? "restaurant" : "attendance"; const start = stamp(body.start_date); const end = stamp(body.end_date);
    if (!start || !end) return NextResponse.json({ error: "Les dates sont obligatoires." }, { status: 400 });
    const startDay = day(start); const endDay = day(end); const target = Math.trunc(Number(body.target_days)); const duration = Math.round((Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`)) / 86400000) + 1;
    if (endDay < startDay || startDay.slice(0, 7) !== endDay.slice(0, 7) || target < 1 || target > duration) return NextResponse.json({ error: "Periode ou objectif invalide." }, { status: 400 });
    const restaurantName = typeof body.restaurant_name === "string" ? body.restaurant_name.trim() : ""; const restaurantRef = typeof body.restaurant_ref === "string" ? body.restaurant_ref.trim() : "";
    if (type === "restaurant" && (!restaurantName || !restaurantRef)) return NextResponse.json({ error: "Le restaurant partenaire est obligatoire." }, { status: 400 });
    const month = startDay.slice(0, 7); const id = type === "restaurant" ? `restaurant_${month}` : month; const { draw_date: _ignored, ...clientFields } = body; const payload = { ...clientFields, challenge_id: id, type, month, start_date: start, end_date: end, target_days: target, draw_date: parisMidnightAfter(endDay), updated_at: FieldValue.serverTimestamp(), updated_by: user.email ?? user.uid, ...(type === "restaurant" ? { restaurant_name: restaurantName, restaurant_ref: restaurantRef } : {}) }; const db = getAdminDb(); await db.collection("monthly_challenges").doc(id).set(payload, { merge: true }); if (type === "attendance") await db.doc(legacy).set(payload, { merge: true }); return NextResponse.json({ ok: true, config: payload });
  } catch (error) { return handleAdminAuthError(error) ?? NextResponse.json({ error: "Impossible d'enregistrer la configuration." }, { status: 500 }); }
}
