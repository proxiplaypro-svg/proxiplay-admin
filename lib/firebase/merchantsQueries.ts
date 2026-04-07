"use client";

import { FirebaseError } from "firebase/app";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  Timestamp,
  updateDoc,
  type DocumentData,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type {
  MerchantActiveGameSummary,
  MerchantPilotageItem,
  MerchantPilotageStatus,
  MerchantRelanceHistoryItem,
} from "@/types/dashboard";
import { db } from "./client-app";

type MerchantCollectionName = "enseignes" | "merchants";
type GameCollectionName = "games" | "jeux";

type FirestoreMerchantDocument = {
  name?: string;
  title?: string;
  merchantName?: string;
  city?: string;
  email?: string;
  phone?: string;
  phone_number?: string;
  commercial_status?: "" | "actif" | "a_relancer" | "inactif";
  last_contact_at?: Timestamp | null;
  last_contact_channel?: string;
  relance_history?: unknown;
};

type FirestoreGameDocument = {
  title?: string;
  name?: string;
  imageUrl?: string;
  photo?: string;
  coverUrl?: string;
  merchantId?: string;
  merchant_id?: string;
  enseigne_id?: DocumentReference | string | null;
  enseigne_name?: string;
  start_date?: Timestamp;
  startDate?: Timestamp;
  end_date?: Timestamp;
  endDate?: Timestamp;
  visible_public?: boolean;
  isPrivate?: boolean;
  private?: boolean;
  views?: number | string;
  participations?: number | string;
  participations_count?: number | string;
  sessionCount?: number | string;
  partiesCount?: number | string;
  updated_at?: Timestamp;
  last_activity_at?: Timestamp;
  created_at?: Timestamp;
  created_time?: Timestamp;
  status?: string;
};

type FirestoreParticipantDocument = {
  participation_date?: Timestamp;
  created_time?: Timestamp;
};

type FirestorePrizeDocument = {
  game_id?: DocumentReference | string | null;
  claimed?: boolean;
  claimed_at?: Timestamp;
  redeemed_at?: Timestamp;
  status?: string;
};

type FirestoreRelanceHistoryDocument = {
  channel?: string;
  type?: string;
  action?: string;
  note?: string;
  message?: string;
  created_at?: Timestamp;
  createdAt?: Timestamp;
  timestamp?: Timestamp;
};

export type MerchantsPilotageData = {
  merchants: MerchantPilotageItem[];
  merchantCollectionName: MerchantCollectionName;
  gamesCollectionName: GameCollectionName;
};

export type UpdateMerchantProfileInput = {
  merchantId: string;
  merchantCollectionName: MerchantCollectionName;
  name: string;
  city: string;
  email: string;
  phone: string;
  commercialStatus: "" | "actif" | "a_relancer" | "inactif";
};

const THIRTY_DAYS_IN_MS = 30 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_IN_MS = 14 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000;

function readText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalizedValue = value?.trim();

    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return "";
}

function readNullableText(...values: Array<string | null | undefined>) {
  const value = readText(...values);
  return value.length > 0 ? value : null;
}

function readNumber(...values: Array<number | string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value);
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number.parseInt(value, 10);

      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function readTimestamp(...values: Array<Timestamp | null | undefined>) {
  return values.find((value) => value instanceof Timestamp) ?? null;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatDateTime(value: number | null) {
  if (!value) {
    return "Jamais relancé";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: number | null) {
  if (!value) {
    return "Date non renseignée";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function buildInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "PP";
}

async function pickCollectionName<TName extends string>(names: readonly TName[], preferred: TName) {
  const snapshots = await Promise.all(
    names.map(async (name) => ({
      name,
      snapshot: await getDocs(query(collection(db, name), limit(1))),
    })),
  );

  const withDocs = snapshots.find((entry) => !entry.snapshot.empty);
  return withDocs?.name ?? preferred;
}

function readMerchantId(value: FirestoreGameDocument["enseigne_id"], fallback?: string | null) {
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return fallback.trim();
  }

  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value.trim() || null;
  }

  return value.id ?? null;
}

function normalizeGameStatus(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();

  switch (normalized) {
    case "actif":
    case "active":
    case "public":
      return "actif" as const;
    case "expire":
    case "expired":
    case "termine":
      return "expire" as const;
    case "brouillon":
    case "draft":
    case "inactive":
      return "brouillon" as const;
    case "prive":
    case "private":
      return "brouillon" as const;
    default:
      return null;
  }
}

function deriveGameState(game: FirestoreGameDocument, now = Date.now()) {
  const explicitStatus = normalizeGameStatus(game.status);
  const startDate = readTimestamp(game.start_date, game.startDate)?.toMillis() ?? null;
  const endDate = readTimestamp(game.end_date, game.endDate)?.toMillis() ?? null;
  const isPublic = game.visible_public !== false;
  const isPrivate = game.isPrivate === true || game.private === true;

  if (explicitStatus === "expire") {
    return "expire" as const;
  }

  if (!isPublic || isPrivate || (startDate !== null && startDate > now)) {
    return "brouillon" as const;
  }

  if (endDate !== null && endDate < now) {
    return "expire" as const;
  }

  if (endDate !== null && endDate - now <= SEVEN_DAYS_IN_MS) {
    return "expire_bientot" as const;
  }

  return "actif" as const;
}

function isPrizeRemis(prize: FirestorePrizeDocument) {
  const status = prize.status?.trim().toLowerCase() ?? "";

  return (
    prize.claimed === true ||
    Boolean(prize.claimed_at) ||
    Boolean(prize.redeemed_at) ||
    ["retire", "retiré", "redeemed", "claimed", "remis"].includes(status)
  );
}

function buildEngagementScore(params: {
  activeGamesCount: number;
  participationsJ30: number;
  lastContactDateValue: number;
  clicksJ30: number;
}) {
  let score = 0;

  if (params.activeGamesCount > 0) {
    score += 40;
  }

  if (params.participationsJ30 > 50) {
    score += 30;
  }

  if (params.lastContactDateValue > 0 && Date.now() - params.lastContactDateValue < SEVEN_DAYS_IN_MS) {
    score += 20;
  }

  if (params.clicksJ30 > 100) {
    score += 10;
  }

  return score;
}

function buildMerchantStatus(params: {
  activeGamesCount: number;
  participationsJ30: number;
  clicksJ30: number;
  lastContactDateValue: number;
}): MerchantPilotageStatus {
  if (params.activeGamesCount > 0) {
    return "actif";
  }

  if (params.participationsJ30 === 0 && params.clicksJ30 === 0 && params.lastContactDateValue === 0) {
    return "inactif";
  }

  return "a_relancer";
}

function buildWhatsAppSafePhone(rawPhone: string) {
  const digits = rawPhone.replace(/[^\d+]/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("+")) {
    return digits.replace(/\+/g, "");
  }

  if (digits.startsWith("00")) {
    return digits.slice(2);
  }

  if (digits.startsWith("0")) {
    return `33${digits.slice(1)}`;
  }

  return digits;
}

function buildRelanceHistoryFromArray(rawHistory: unknown): MerchantRelanceHistoryItem[] {
  if (!Array.isArray(rawHistory)) {
    return [];
  }

  return rawHistory
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const item = entry as Record<string, unknown>;
      const timestampValue =
        readTimestamp(
          item.created_at as Timestamp | null | undefined,
          item.createdAt as Timestamp | null | undefined,
          item.timestamp as Timestamp | null | undefined,
        )?.toMillis() ?? 0;
      const channelText = readText(item.channel as string | undefined, item.type as string | undefined).toLowerCase();
      const channel =
        channelText === "email"
          ? "email"
          : channelText === "whatsapp"
            ? "whatsapp"
            : "manual";
      const label = readText(
        item.label as string | undefined,
        item.action as string | undefined,
        item.message as string | undefined,
      );

      if (!label && !timestampValue) {
        return null;
      }

      return {
        id: `history-array-${index}`,
        channel,
        label: label || "Relance enregistrée",
        note: readText(item.note as string | undefined),
        timestampLabel: formatDateTime(timestampValue),
        timestampValue,
      } satisfies MerchantRelanceHistoryItem;
    })
    .filter((item): item is MerchantRelanceHistoryItem => Boolean(item))
    .sort((left, right) => right.timestampValue - left.timestampValue)
    .slice(0, 5);
}

async function readRelanceHistory(
  merchantId: string,
  merchantCollectionName: MerchantCollectionName,
  merchantDocument: FirestoreMerchantDocument,
) {
  const historyFromArray = buildRelanceHistoryFromArray(merchantDocument.relance_history);

  if (historyFromArray.length > 0) {
    return historyFromArray;
  }

  try {
    const historySnapshot = await getDocs(collection(doc(db, "relances", merchantId), "history"));

    return historySnapshot.docs
      .map((snapshot) => {
        const data = snapshot.data() as FirestoreRelanceHistoryDocument;
        const timestampValue =
          readTimestamp(data.created_at, data.createdAt, data.timestamp)?.toMillis() ?? 0;
        const channelText = readText(data.channel, data.type).toLowerCase();

        return {
          id: snapshot.id,
          channel:
            channelText === "email"
              ? "email"
              : channelText === "whatsapp"
                ? "whatsapp"
                : "manual",
          label: readText(data.action, data.message, "Relance enregistrée"),
          note: readText(data.note),
          timestampLabel: formatDateTime(timestampValue),
          timestampValue,
        } satisfies MerchantRelanceHistoryItem;
      })
      .sort((left, right) => right.timestampValue - left.timestampValue)
      .slice(0, 5);
  } catch {
    // TODO: brancher un vrai historique relances si la collection est normalisée plus tard.
    void merchantCollectionName;
    return [];
  }
}

function mapMerchantDocument(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  merchantCollectionName: MerchantCollectionName,
  gamesCollectionName: GameCollectionName,
  merchantStats: {
    activeGamesCount: number;
    clicksJ30: number;
    participationsJ30: number;
    gainsRemis: number;
    activeGames: MerchantActiveGameSummary[];
  },
): MerchantPilotageItem {
  const merchant = snapshot.data() as FirestoreMerchantDocument;
  const lastContactDateValue = merchant.last_contact_at?.toMillis() ?? 0;
  const engagementScore = buildEngagementScore({
    activeGamesCount: merchantStats.activeGamesCount,
    participationsJ30: merchantStats.participationsJ30,
    lastContactDateValue,
    clicksJ30: merchantStats.clicksJ30,
  });

  return {
    id: snapshot.id,
    name: readText(merchant.name, merchant.title, merchant.merchantName, "Enseigne sans nom"),
    city: readText(merchant.city),
    email: readText(merchant.email),
    phone: readText(merchant.phone, merchant.phone_number),
    merchantCollectionName,
    gamesCollectionName,
    commercialStatus: merchant.commercial_status ?? "",
    lastContactDate: lastContactDateValue > 0 ? new Date(lastContactDateValue).toISOString() : null,
    lastContactDateLabel: formatDateTime(lastContactDateValue),
    lastContactDateValue,
    lastContactChannel: readText(merchant.last_contact_channel),
    gamesActiveCount: merchantStats.activeGamesCount,
    clicksJ30: merchantStats.clicksJ30,
    participationsJ30: merchantStats.participationsJ30,
    gainsRemis: merchantStats.gainsRemis,
    engagementScore,
    status: buildMerchantStatus({
      activeGamesCount: merchantStats.activeGamesCount,
      participationsJ30: merchantStats.participationsJ30,
      clicksJ30: merchantStats.clicksJ30,
      lastContactDateValue,
    }),
    initials: buildInitials(readText(merchant.name, merchant.title, merchant.merchantName, "Enseigne sans nom")),
    activeGames: merchantStats.activeGames,
    relanceHistory: [],
  };
}

export async function getMerchantsPilotageData(): Promise<MerchantsPilotageData> {
  const [merchantCollectionName, gamesCollectionName] = await Promise.all([
    pickCollectionName(["enseignes", "merchants"] as const, "enseignes"),
    pickCollectionName(["games", "jeux"] as const, "games"),
  ]);

  const [merchantSnapshot, gamesSnapshot, prizesSnapshot] = await Promise.all([
    getDocs(collection(db, merchantCollectionName)),
    getDocs(collection(db, gamesCollectionName)),
    getDocs(collection(db, "prizes")),
  ]);

  const now = Date.now();
  const thresholdTimestamp = Timestamp.fromMillis(now - THIRTY_DAYS_IN_MS);
  const statsByMerchantId = new Map<
    string,
    {
      activeGamesCount: number;
      clicksJ30: number;
      participationsJ30: number;
      gainsRemis: number;
      activeGames: MerchantActiveGameSummary[];
    }
  >();
  const merchantById = new Map<string, FirestoreMerchantDocument>();

  merchantSnapshot.docs.forEach((snapshot) => {
    merchantById.set(snapshot.id, snapshot.data() as FirestoreMerchantDocument);
    statsByMerchantId.set(snapshot.id, {
      activeGamesCount: 0,
      clicksJ30: 0,
      participationsJ30: 0,
      gainsRemis: 0,
      activeGames: [],
    });
  });

  const participantCounts = await Promise.all(
    gamesSnapshot.docs.map(async (snapshot) => {
      try {
        const participantsSnapshot = await getDocs(collection(snapshot.ref, "participants"));
        const recentCount = participantsSnapshot.docs.reduce((total, participantSnapshot) => {
          const participant = participantSnapshot.data() as FirestoreParticipantDocument;
          const timestamp = readTimestamp(participant.participation_date, participant.created_time);

          if (timestamp && timestamp.toMillis() >= thresholdTimestamp.toMillis()) {
            return total + 1;
          }

          return total;
        }, 0);

        return {
          gameId: snapshot.id,
          recentCount,
        };
      } catch {
        return {
          gameId: snapshot.id,
          recentCount: 0,
        };
      }
    }),
  );

  const participantsByGameId = new Map(participantCounts.map((item) => [item.gameId, item.recentCount]));
  const merchantIdByGameId = new Map<string, string>();

  gamesSnapshot.docs.forEach((snapshot) => {
    const game = snapshot.data() as FirestoreGameDocument;
    const merchantId = readMerchantId(game.enseigne_id, game.merchantId ?? game.merchant_id ?? null);

    if (!merchantId || !statsByMerchantId.has(merchantId)) {
      return;
    }

    merchantIdByGameId.set(snapshot.id, merchantId);

    const merchantStats = statsByMerchantId.get(merchantId);

    if (!merchantStats) {
      return;
    }

    const gameStatus = deriveGameState(game, now);
    const endDateValue = readTimestamp(game.end_date, game.endDate)?.toMillis() ?? 0;
    const activityTimestamp = readTimestamp(game.last_activity_at, game.updated_at, game.created_at, game.created_time)?.toMillis() ?? 0;
    const participationsJ30 = participantsByGameId.get(snapshot.id) ?? 0;
    const clicks = readNumber(game.views);
    const sessionsCount = readNumber(game.sessionCount, game.partiesCount, game.participations, game.participations_count);

    if (gameStatus === "actif" || gameStatus === "expire_bientot") {
      merchantStats.activeGamesCount += 1;
      merchantStats.activeGames.push({
        id: snapshot.id,
        name: readText(game.title, game.name, "Jeu sans titre"),
        imageUrl: readNullableText(game.imageUrl, game.photo, game.coverUrl),
        status: gameStatus,
        expiryLabel: endDateValue > 0
          ? `Expire dans ${Math.max(0, Math.ceil((endDateValue - now) / (1000 * 60 * 60 * 24)))}j`
          : "Date de fin inconnue",
        participationsLabel: `${formatCount(sessionsCount)} parties`,
        sessionsCount,
        endDateValue,
      });
    }

    if (activityTimestamp >= now - THIRTY_DAYS_IN_MS || gameStatus === "actif" || gameStatus === "expire_bientot") {
      merchantStats.clicksJ30 += clicks;
    }

    merchantStats.participationsJ30 += participationsJ30;
  });

  prizesSnapshot.docs.forEach((snapshot) => {
    const prize = snapshot.data() as FirestorePrizeDocument;
    const gameId =
      typeof prize.game_id === "string"
        ? prize.game_id
        : prize.game_id?.id ?? null;
    const merchantId = gameId ? merchantIdByGameId.get(gameId) ?? null : null;

    if (!merchantId || !isPrizeRemis(prize)) {
      return;
    }

    const merchantStats = statsByMerchantId.get(merchantId);

    if (merchantStats) {
      merchantStats.gainsRemis += 1;
    }
  });

  const merchants = await Promise.all(
    merchantSnapshot.docs.map(async (snapshot) => {
      const merchantStats = statsByMerchantId.get(snapshot.id) ?? {
        activeGamesCount: 0,
        clicksJ30: 0,
        participationsJ30: 0,
        gainsRemis: 0,
        activeGames: [],
      };
      const merchant = mapMerchantDocument(
        snapshot,
        merchantCollectionName,
        gamesCollectionName,
        {
          ...merchantStats,
          activeGames: [...merchantStats.activeGames].sort((left, right) => left.endDateValue - right.endDateValue),
        },
      );

      merchant.relanceHistory = await readRelanceHistory(
        merchant.id,
        merchantCollectionName,
        merchantById.get(snapshot.id) ?? {},
      );

      return merchant;
    }),
  );

  return {
    merchants,
    merchantCollectionName,
    gamesCollectionName,
  };
}

export async function updateMerchantProfile(input: UpdateMerchantProfileInput) {
  const merchantRef = doc(db, input.merchantCollectionName, input.merchantId);
  const trimmedPhone = input.phone.trim();

  await updateDoc(merchantRef, {
    name: input.name.trim() || deleteField(),
    city: input.city.trim() || deleteField(),
    email: input.email.trim() || deleteField(),
    phone: trimmedPhone || deleteField(),
    phone_number: trimmedPhone || deleteField(),
    commercial_status: input.commercialStatus || deleteField(),
  });
}

export function getMerchantsPilotageErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "permission-denied":
        return "Accès admin requis pour lire ou modifier les commerçants.";
      case "unavailable":
        return "Firestore est temporairement indisponible.";
      default:
        return error.message || "Une erreur Firebase a bloqué l’opération commerçants.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Une erreur inattendue a bloqué l’opération commerçants.";
}

export function buildWhatsAppLink(phone: string, name: string) {
  const normalizedPhone = buildWhatsAppSafePhone(phone);

  if (!normalizedPhone) {
    return null;
  }

  const text = encodeURIComponent(
    `Bonjour ${name}, voici un message de relance ProxiPlay. Nous voulions faire un point rapide sur vos jeux et vos résultats récents.`,
  );

  return `https://wa.me/${normalizedPhone}?text=${text}`;
}

export function buildMerchantEmailLink(email: string, name: string) {
  const normalizedEmail = email.trim();

  if (!normalizedEmail) {
    return null;
  }

  const subject = encodeURIComponent("Votre jeu ProxiPlay");
  const body = encodeURIComponent(
    `Bonjour ${name},\n\nNous revenons vers vous au sujet de votre activité ProxiPlay et de vos jeux en cours.\n\nBien à vous,\nL'équipe ProxiPlay`,
  );

  return `mailto:${normalizedEmail}?subject=${subject}&body=${body}`;
}
