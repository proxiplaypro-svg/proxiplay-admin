import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getConfiguredAdminEmails, isAllowedAdminEmail } from "@/lib/firebase/adminAccess";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin-app";

type MarkWinnersAsRetiredBody = {
  prizeIds?: string[];
};

function normalizePrizeIds(prizeIds: string[] | undefined) {
  return [...new Set((prizeIds ?? []).map((prizeId) => prizeId.trim()).filter(Boolean))];
}

async function assertIsAdminRequest(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new Error("UNAUTHENTICATED");
  }

  const decodedToken = await getAdminAuth().verifyIdToken(token);
  const adminEmails = getConfiguredAdminEmails();

  if (!isAllowedAdminEmail(decodedToken.email, adminEmails)) {
    throw new Error("FORBIDDEN");
  }

  return decodedToken;
}

export async function POST(request: Request) {
  try {
    const decodedToken = await assertIsAdminRequest(request);
    const adminDb = getAdminDb();
    const body = (await request.json()) as MarkWinnersAsRetiredBody;
    const prizeIds = normalizePrizeIds(body.prizeIds);

    console.info("[ADMIN_WINNER_MARK_CLAIMED_START]", {
      adminEmail: decodedToken.email ?? null,
      prizeIds,
    });

    if (prizeIds.length === 0) {
      return NextResponse.json({ error: "Aucun lot a mettre a jour." }, { status: 400 });
    }

    const batch = adminDb.batch();

    prizeIds.forEach((prizeId) => {
      batch.update(adminDb.collection("prizes").doc(prizeId), {
        status: "claimed",
        claimed: true,
        claimed_by_admin: true,
        claimed_at: FieldValue.serverTimestamp(),
        redeemed_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    console.info("[ADMIN_WINNER_MARK_CLAIMED_SUCCESS]", {
      adminEmail: decodedToken.email ?? null,
      updatedCount: prizeIds.length,
      prizeIds,
    });

    return NextResponse.json({
      updatedCount: prizeIds.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      console.error("[ADMIN_WINNER_MARK_CLAIMED_ERROR]", {
        reason: "UNAUTHENTICATED",
      });
      return NextResponse.json({ error: "Connexion admin requise." }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      console.error("[ADMIN_WINNER_MARK_CLAIMED_ERROR]", {
        reason: "FORBIDDEN",
      });
      return NextResponse.json({ error: "Acces admin requis." }, { status: 403 });
    }

    console.error("[ADMIN_WINNER_MARK_CLAIMED_ERROR]", error);

    return NextResponse.json(
      { error: "Impossible de marquer ce ou ces lots comme retires pour le moment." },
      { status: 500 },
    );
  }
}
