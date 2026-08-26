import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin-app";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";

const legacyAttendanceConfigPath = "app_config/monthly_challenge";
const parisTimeZone = "Europe/Paris";

function readTimestamp(value: unknown): Timestamp | null {
  const timestamp = value as { seconds?: unknown; nanoseconds?: unknown } | null;
  if (typeof timestamp?.seconds !== "number") return null;
  return new Timestamp(timestamp.seconds, typeof timestamp.nanoseconds === "number" ? timestamp.nanoseconds : 0);
}

function getParisDayKey(value: Timestamp): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: parisTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value.toDate());
}

function getParisMidnightAfter(dayKey: string): Timestamp {
  const [year, month, day] = dayKey.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1, 12));
  const [nextYear, nextMonth, nextDate] = nextDay.toISOString().slice(0, 10).split("-").map(Number);
  const utcMidnight = Date.UTC(nextYear, nextMonth - 1, nextDate);
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: parisTimeZone,
    timeZoneName: "longOffset",
  }).formatToParts(new Date(utcMidnight)).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offset);
  const offsetMilliseconds = match
    ? (Number(match[2]) * 60 + Number(match[3])) * 60_000 * (match[1] === "+" ? 1 : -1)
    : 0;
  return Timestamp.fromMillis(utcMidnight - offsetMilliseconds);
}

function getMerchantInput(body: Record<string, unknown>) {
  return {
    ref: typeof body.enseigne_ref === "string" ? body.enseigne_ref.trim() : typeof body.restaurant_ref === "string" ? body.restaurant_ref.trim() : "",
    name: typeof body.enseigne_name === "string" ? body.enseigne_name.trim() : typeof body.restaurant_name === "string" ? body.restaurant_name.trim() : "",
    image: typeof body.enseigne_image === "string" ? body.enseigne_image.trim() : typeof body.restaurant_image === "string" ? body.restaurant_image.trim() : "",
  };
}

async function getMerchantConfig(month: string | null) {
  const db = getAdminDb();
  if (month) {
    const current = await db.collection("monthly_challenges").doc(`merchant_${month}`).get();
    if (current.exists) return current.data();
    const legacy = await db.collection("monthly_challenges").doc(`restaurant_${month}`).get();
    return legacy.exists ? legacy.data() : null;
  }
  const current = await db.collection("monthly_challenges").where("type", "==", "merchant").limit(1).get();
  if (!current.empty) return current.docs[0].data();
  const legacy = await db.collection("monthly_challenges").where("type", "==", "restaurant").limit(1).get();
  return legacy.empty ? null : legacy.docs[0].data();
}

function readReferencePath(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "path" in value && typeof value.path === "string") {
    return value.path;
  }
  return "";
}

function normalizeMerchantConfigForResponse(
  config: Record<string, unknown> | null | undefined,
) {
  if (!config) return null;
  const { restaurant_ref, restaurant_name, restaurant_image, restaurant_image_url, ...rest } = config;
  return {
    ...rest,
    type: "merchant",
    enseigne_ref: readReferencePath(config.enseigne_ref ?? restaurant_ref),
    enseigne_name: typeof config.enseigne_name === "string"
      ? config.enseigne_name
      : typeof restaurant_name === "string"
        ? restaurant_name
        : "",
    enseigne_image: typeof config.enseigne_image === "string"
      ? config.enseigne_image
      : typeof restaurant_image === "string"
        ? restaurant_image
        : typeof restaurant_image_url === "string"
          ? restaurant_image_url
          : "",
  };
}

export async function GET(request: NextRequest) {
  try {
    await assertIsAdminRequest(request);
    const requestedType = request.nextUrl.searchParams.get("type");
    const isMerchant = requestedType === "merchant" || requestedType === "restaurant";
    const month = request.nextUrl.searchParams.get("month");
    if (isMerchant) {
      return NextResponse.json({
        config: normalizeMerchantConfigForResponse(await getMerchantConfig(month)),
      });
    }

    const config = month
      ? await getAdminDb().collection("monthly_challenges").doc(month).get()
      : await getAdminDb().doc(legacyAttendanceConfigPath).get();
    return NextResponse.json({ config: config.exists ? config.data() : null });
  } catch (error) {
    return handleAdminAuthError(error) ?? NextResponse.json({ error: "Impossible de charger la configuration." }, { status: 500 });
  }
}

async function findOverlappingActiveChallenge(
  db: FirebaseFirestore.Firestore,
  excludeChallengeId: string,
  startDay: string,
  endDay: string,
) {
  const activeSnap = await db.collection("monthly_challenges").where("enabled", "==", true).get();
  for (const doc of activeSnap.docs) {
    if (doc.id === excludeChallengeId) continue;
    const data = doc.data();
    const otherStart = readTimestamp(data.start_date);
    const otherEnd = readTimestamp(data.end_date);
    if (!otherStart || !otherEnd) continue;
    const otherStartDay = getParisDayKey(otherStart);
    const otherEndDay = getParisDayKey(otherEnd);
    if (otherStartDay <= endDay && startDay <= otherEndDay) {
      return { id: doc.id, title: typeof data.title === "string" ? data.title : "" };
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await assertIsAdminRequest(request);
    const body = await request.json() as Record<string, unknown>;
    // Un seul mecanisme de Bonus du mois (assiduite), l'enseigne partenaire
    // est un champ optionnel qui enrichit le lot -- ce n'est plus un type de
    // challenge distinct. "merchant"/"restaurant" restent lus en lecture
    // (getMerchantConfig, normalizeMerchantConfigForResponse) pour l'ancien
    // historique, mais l'ecriture ne cree plus que des challenges attendance.
    const type = "attendance";
    const startDate = readTimestamp(body.start_date);
    const endDate = readTimestamp(body.end_date);
    if (!startDate || !endDate) return NextResponse.json({ error: "Les dates sont obligatoires." }, { status: 400 });

    const startDay = getParisDayKey(startDate);
    const endDay = getParisDayKey(endDate);
    const targetDays = Math.trunc(Number(body.target_days));
    const duration = Math.round((Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`)) / 86_400_000) + 1;
    if (endDay < startDay || startDay.slice(0, 7) !== endDay.slice(0, 7) || targetDays < 1 || targetDays > duration) {
      return NextResponse.json({ error: "Periode ou objectif invalide." }, { status: 400 });
    }

    const merchant = getMerchantInput(body);

    const month = startDay.slice(0, 7);
    const challengeId = month;
    const db = getAdminDb();

    if (body.enabled === true) {
      const conflict = await findOverlappingActiveChallenge(db, challengeId, startDay, endDay);
      if (conflict) {
        return NextResponse.json({
          error: `Un autre Bonus du mois est deja actif sur cette periode${conflict.title ? ` ("${conflict.title}")` : ""}. Desactivez-le avant d'activer celui-ci.`,
        }, { status: 409 });
      }
    }

    const payload = {
      challenge_id: challengeId,
      type,
      enabled: body.enabled === true,
      month,
      start_date: startDate,
      end_date: endDate,
      target_days: targetDays,
      title: typeof body.title === "string" ? body.title.trim() : "",
      description: typeof body.description === "string" ? body.description.trim() : "",
      prize_title: typeof body.prize_title === "string" ? body.prize_title.trim() : "",
      prize_description: typeof body.prize_description === "string" ? body.prize_description.trim() : "",
      prize_value: Number(body.prize_value) || 0,
      image_url: typeof body.image_url === "string" ? body.image_url.trim() : "",
      draw_date: getParisMidnightAfter(endDay),
      updated_at: FieldValue.serverTimestamp(),
      updated_by: user.email ?? user.uid,
      enseigne_ref: merchant.ref,
      enseigne_name: merchant.name,
      enseigne_image: merchant.image,
    };

    await db.collection("monthly_challenges").doc(challengeId).set(payload, { merge: true });
    await db.doc(legacyAttendanceConfigPath).set(payload, { merge: true });
    return NextResponse.json({ ok: true, config: payload });
  } catch (error) {
    return handleAdminAuthError(error) ?? NextResponse.json({ error: "Impossible d'enregistrer la configuration." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await assertIsAdminRequest(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const type = body.type === "merchant" || body.type === "restaurant" ? "merchant" : "attendance";
    const challengeId = typeof body.challenge_id === "string" ? body.challenge_id.trim() : "";
    if (!challengeId) return NextResponse.json({ error: "Identifiant de campagne manquant." }, { status: 400 });

    const db = getAdminDb();
    await db.collection("monthly_challenges").doc(challengeId).delete();
    if (type === "attendance") await db.doc(legacyAttendanceConfigPath).delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAdminAuthError(error) ?? NextResponse.json({ error: "Impossible de supprimer la campagne." }, { status: 500 });
  }
}
