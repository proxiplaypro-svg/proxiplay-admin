import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin-app";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";

const kMonthlyChallengeConfigPath = "app_config/monthly_challenge";
const kDefaultTargetDays = 15;

function parseTimestamp(value: unknown): Timestamp | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const seconds = typeof obj.seconds === "number" ? obj.seconds : null;
  const nanoseconds = typeof obj.nanoseconds === "number" ? obj.nanoseconds : 0;
  if (seconds === null) return null;
  return new Timestamp(seconds, nanoseconds);
}

function parseMonthKey(monthKey: unknown): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(typeof monthKey === "string" ? monthKey.trim() : "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function getDaysInMonth(monthKey: unknown): number {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return 0;
  return new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
}

function getChallengePeriodEnd(monthKey: unknown): Date | null {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month, 0, 23, 59, 59, 999));
}

function getMonthlyChallengeDocRef() {
  return getAdminDb().doc(kMonthlyChallengeConfigPath);
}

export async function GET(request: NextRequest) {
  try {
    await assertIsAdminRequest(request);
    const snap = await getMonthlyChallengeDocRef().get();
    return NextResponse.json({ config: snap.exists ? snap.data() : null });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[MONTHLY_CHALLENGE_GET]", error);
    return NextResponse.json(
      { error: "Impossible de charger la configuration du defi mensuel." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await assertIsAdminRequest(request);
    const body = (await request.json()) as Record<string, unknown>;

    const enabled = body.enabled === true;
    const month = typeof body.month === "string" ? body.month.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const targetDaysRaw = Number(body.target_days);
    const targetDays = Number.isFinite(targetDaysRaw)
      ? Math.max(1, Math.trunc(targetDaysRaw))
      : kDefaultTargetDays;
    const prizeTitle = typeof body.prize_title === "string" ? body.prize_title.trim() : "";
    const prizeDescription =
      typeof body.prize_description === "string" ? body.prize_description.trim() : "";
    const prizeValueRaw = Number(body.prize_value);
    const prizeValue = Number.isFinite(prizeValueRaw) ? prizeValueRaw : 0;
    const imageUrl = typeof body.image_url === "string" ? body.image_url.trim() : "";
    const drawDate = parseTimestamp(body.draw_date);

    if (!/^\d{4}-\d{2}$/.test(month) || !parseMonthKey(month)) {
      return NextResponse.json({ error: "Le mois doit etre un YYYY-MM valide." }, { status: 400 });
    }

    const daysInMonth = getDaysInMonth(month);
    if (targetDays < 1 || targetDays > daysInMonth) {
      return NextResponse.json(
        { error: `L'objectif en jours doit etre compris entre 1 et ${daysInMonth}.` },
        { status: 400 },
      );
    }

    if (!drawDate) {
      return NextResponse.json({ error: "La date de tirage est obligatoire." }, { status: 400 });
    }
    const periodEnd = getChallengePeriodEnd(month);
    if (!periodEnd || drawDate.toDate().getTime() <= periodEnd.getTime()) {
      return NextResponse.json(
        { error: "La date de tirage doit etre posterieure a la fin du mois du defi." },
        { status: 400 },
      );
    }

    if (enabled && (!title || !prizeTitle)) {
      return NextResponse.json(
        { error: "Titre et lot sont obligatoires lorsque le defi est active." },
        { status: 400 },
      );
    }

    const payload = {
      enabled,
      month,
      title,
      description,
      target_days: targetDays,
      prize_title: prizeTitle,
      prize_description: prizeDescription,
      prize_value: prizeValue,
      image_url: imageUrl,
      draw_date: drawDate,
      updated_at: FieldValue.serverTimestamp(),
      updated_by: decodedToken.email ?? decodedToken.uid,
    };

    await getMonthlyChallengeDocRef().set(payload, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[MONTHLY_CHALLENGE_UPSERT]", error);
    return NextResponse.json(
      { error: "Impossible d'enregistrer la configuration du defi mensuel." },
      { status: 500 },
    );
  }
}
