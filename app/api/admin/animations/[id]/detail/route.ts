import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin-app";

type FirestoreGameDocument = {
  name?: string;
  title?: string;
  enseigne_name?: string;
  merchantName?: string;
  enseigne_id?: { id?: string } | string | null;
  merchant_id?: string;
  animation_id?: string | null;
  campaign_id?: string | null;
};

type FirestoreUserDocument = {
  email?: string;
  display_name?: string;
  displayName?: string;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
};

type FirestoreProgressDocument = {
  visited_merchant_ids?: string[];
  visited_count?: number;
  threshold_reached?: boolean;
  last_updated?: { toMillis: () => number };
};

type FirestorePrizeDocument = {
  winner_id?: { id?: string } | null;
  game_id?: { id?: string } | null;
  merchantName?: string;
  merchant_name?: string;
  enseigne_name?: string;
  claimed?: boolean;
  claimed_at?: { toMillis: () => number } | null;
  redeemed_at?: { toMillis: () => number } | null;
  expiredAt?: { toMillis: () => number } | null;
  expired_at?: { toMillis: () => number } | null;
  win_date?: { toMillis: () => number } | null;
  created_at?: { toMillis: () => number } | null;
  created_time?: { toMillis: () => number } | null;
  updated_at?: { toMillis: () => number } | null;
  prize_label?: string;
  prize_name?: string;
  prize_title?: string;
  label?: string;
  name?: string;
  title?: string;
  status?: string;
};

type WinnerDocument = {
  uid?: string;
  label?: string;
  email?: string;
  selected_at?: { toMillis: () => number } | null;
};

function readText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function readMerchantId(
  enseigneId?: { id?: string } | string | null,
  fallback?: string | null,
) {
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return fallback.trim();
  }

  if (!enseigneId) {
    return null;
  }

  if (typeof enseigneId === "string") {
    return enseigneId.trim() || null;
  }

  return enseigneId.id?.trim() || null;
}

function buildPlayerLabel(data: FirestoreUserDocument, fallbackEmail: string) {
  const display = readText(data.display_name, data.displayName);
  if (display) {
    return display;
  }

  const fullName = readText(
    [data.first_name, data.last_name].filter(Boolean).join(" "),
    [data.firstName, data.lastName].filter(Boolean).join(" "),
  );
  if (fullName) {
    return fullName;
  }

  return fallbackEmail || "Joueur inconnu";
}

function normalizeStatusValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatDateValue(value: number | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("fr-FR", options ?? {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Impossible de charger le detail de l animation.";
}

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const adminDb = getAdminDb();
    const { id } = await params;
    const animationId = id.trim();

    if (!animationId || animationId.includes("/")) {
      return NextResponse.json(
        { error: "animationId invalide." },
        { status: 400 },
      );
    }

    const [gamesSnapshot, prizesSnapshot, entriesSnapshot, winnerSnapshot] =
      await Promise.all([
        adminDb.collection("games").where("animation_id", "==", animationId).get(),
        adminDb.collection("prizes").where("animation_id", "==", animationId).get(),
        adminDb
          .collection("animations")
          .doc(animationId)
          .collection("entries")
          .where("threshold_reached", "==", true)
          .get(),
        adminDb.doc(`animations/${animationId}/winner/current`).get(),
      ]);

    const games = gamesSnapshot.docs.map((snapshot) => {
      const data = (snapshot.data() as FirestoreGameDocument | undefined) ?? {};

      return {
        id: snapshot.id,
        animation_id: data.animation_id ?? null,
        campaign_id: data.campaign_id ?? null,
        title: readText(data.name, data.title, "Jeu sans nom"),
        merchantId: readMerchantId(data.enseigne_id, data.merchant_id),
        merchantName: readText(data.enseigne_name, data.merchantName, "Commerce inconnu"),
      };
    });

    const gameById = new Map(games.map((game) => [game.id, game]));

    // Joueurs qualifiés : lus depuis animations/{id}/entries (écrits par participateInGameTransaction)
    const qualifiedUserIds = entriesSnapshot.docs.map((snapshot) => snapshot.id).filter(Boolean);

    const qualifiedUserSnapshots = await Promise.all(
      qualifiedUserIds.map((uid) => adminDb.doc(`users/${uid}`).get()),
    );

    const qualifiedUsers = entriesSnapshot.docs
      .map((snapshot, index) => {
        const entryData = (snapshot.data() as FirestoreProgressDocument | undefined) ?? {};
        const uid = snapshot.id;
        const userData =
          (qualifiedUserSnapshots[index]?.data() as FirestoreUserDocument | undefined) ?? {};
        const email = readText(userData.email);

        return {
          uid,
          label: buildPlayerLabel(userData, email),
          email: email || "-",
          visitedMerchantsCount: typeof entryData.visited_count === "number"
            ? entryData.visited_count
            : Array.isArray(entryData.visited_merchant_ids)
              ? entryData.visited_merchant_ids.length
              : 0,
          lastUpdatedLabel: formatDateValue(
            entryData.last_updated?.toMillis() ?? null,
            {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            },
          ),
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label, "fr"));

    const uniqueWinnerIds = [
      ...new Set(
        prizesSnapshot.docs
          .map((snapshot) => {
            const prize = (snapshot.data() as FirestorePrizeDocument | undefined) ?? {};
            return prize.winner_id?.id ?? null;
          })
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    const winnerUserSnapshots = await Promise.all(
      uniqueWinnerIds.map((uid) => adminDb.doc(`users/${uid}`).get()),
    );
    const usersById = new Map(
      winnerUserSnapshots
        .filter((snapshot) => snapshot.exists)
        .map((snapshot) => [
          snapshot.id,
          (snapshot.data() as FirestoreUserDocument | undefined) ?? {},
        ]),
    );

    const prizes = prizesSnapshot.docs
      .map((snapshot) => {
        const prize = (snapshot.data() as FirestorePrizeDocument | undefined) ?? {};
        const winnerId = prize.winner_id?.id ?? null;
        const userData = winnerId ? usersById.get(winnerId) ?? null : null;
        const gameId = prize.game_id?.id ?? null;
        const gameData = gameId ? gameById.get(gameId) ?? null : null;
        const explicitStatus = normalizeStatusValue(readText(prize.status));
        const isClaimed =
          prize.claimed === true ||
          Boolean(prize.claimed_at) ||
          Boolean(prize.redeemed_at) ||
          [
            "retire",
            "retiree",
            "redeemed",
            "claimed",
            "remis",
            "reclame",
            "reclamee",
          ].includes(explicitStatus);
        const expiresAt = prize.expiredAt ?? prize.expired_at ?? null;
        const isExpired =
          !isClaimed &&
          (explicitStatus === "expire" ||
            explicitStatus === "expired" ||
            ((expiresAt?.toMillis() ?? 0) > 0 && (expiresAt?.toMillis() ?? 0) < Date.now()));
        const wonAt =
          prize.win_date ??
          prize.created_at ??
          prize.created_time ??
          prize.updated_at ??
          null;

        return {
          id: snapshot.id,
          playerLabel: buildPlayerLabel(userData ?? {}, readText(userData?.email)),
          playerEmail: readText(userData?.email) || "-",
          merchantName:
            readText(
              prize.merchantName,
              prize.merchant_name,
              prize.enseigne_name,
              gameData?.merchantName,
            ) || "Commerce inconnu",
          prizeLabel:
            readText(
              prize.prize_label,
              prize.prize_name,
              prize.prize_title,
              prize.label,
              prize.name,
              prize.title,
            ) || "Lot non renseigne",
          wonAtLabel: formatDateValue(wonAt?.toMillis() ?? null, {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          wonAtValue: wonAt?.toMillis() ?? 0,
          status: isClaimed ? "claimed" : isExpired ? "expired" : "pending",
        };
      })
      .sort((left, right) => right.wonAtValue - left.wonAtValue);

    const winnerData = (winnerSnapshot.data() as WinnerDocument | undefined) ?? undefined;
    const winner = winnerData?.uid
      ? {
          uid: winnerData.uid,
          label: readText(winnerData.label, "Gagnant inconnu"),
          email: readText(winnerData.email, "-"),
          selectedAtLabel: formatDateValue(winnerData.selected_at?.toMillis() ?? null, {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        }
      : null;

    return NextResponse.json({
      games,
      prizes,
      qualifiedUsers,
      winner,
      participantsCount: qualifiedUsers.length,
    });
  } catch (error) {
    console.error("Animation detail API failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
