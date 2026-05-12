"use client";

import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  Timestamp,
  updateDoc,
  type DocumentData,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type {
  Game,
  GameMerchantOption,
  GameSecondaryPrize,
  GameStatus,
} from "@/types/dashboard";
import { auth } from "./auth";
import { db, storage } from "./client-app";

type GameCollectionName = "games" | "jeux";
type MerchantCollectionName = "enseignes" | "merchants";

type FirestoreGameDocument = {
  title?: string;
  name?: string;
  description?: string;
  conditions?: string;
  merchantId?: string;
  merchant_id?: string;
  enseigne_name?: string;
  merchantName?: string;
  enseigne_id?: DocumentReference | string | null;
  merchantRef?: DocumentReference | null;
  start_date?: Timestamp;
  startDate?: Timestamp;
  end_date?: Timestamp;
  endDate?: Timestamp;
  status?: string;
  imageUrl?: string;
  photo?: string;
  coverUrl?: string;
  visible_public?: boolean;
  isPrivate?: boolean;
  private?: boolean;
  sessionCount?: number | string;
  partiesCount?: number | string;
  participations?: number | string;
  participations_count?: number | string;
  hasMainPrize?: boolean;
  main_prize_title?: string;
  main_prize_description?: string;
  prize_value?: number | string | null;
  main_prize_image?: string;
  secondary_prizes?: FirestoreSecondaryPrizeDocument[] | null;
  restrictedToAdults?: boolean;
};

type FirestoreSecondaryPrizeDocument = {
  name?: string;
  description?: string;
  count?: number | string;
  image?: string;
};

type FirestoreMerchantDocument = {
  name?: string;
  title?: string;
  merchantName?: string;
};

export type GamesAdminData = {
  games: Game[];
  merchants: GameMerchantOption[];
  gameCollection: GameCollectionName;
  merchantCollection: MerchantCollectionName;
};

export type UpdateGameStatusInput = {
  gameId: string;
  collectionName: GameCollectionName;
  status: GameStatus;
};

export type UpdateGameInput = {
  gameId: string;
  collectionName: GameCollectionName;
  merchantCollectionName: MerchantCollectionName;
  title: string;
  description: string;
  merchantId: string | null;
  merchantName: string;
  startDate: string | null;
  endDate: string | null;
  status: GameStatus;
  imageUrl: string | null;
  imageFile?: File | null;
  hasMainPrize: boolean;
  mainPrizeTitle: string;
  mainPrizeDescription: string;
  mainPrizeValue: string;
  mainPrizeImage: string | null;
  mainPrizeImageFile?: File | null;
  secondaryPrizes: GameSecondaryPrize[];
  secondaryPrizeImageFiles?: Array<File | null>;
  restrictedToAdults: boolean;
};

export type DuplicateGameInput = {
  gameId: string;
  collectionName: GameCollectionName;
};

export type DuplicateGameResult = {
  game: Game;
};

const VALID_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const GAMES_AUTH_ERROR_MESSAGE = "Connexion requise pour acceder aux jeux.";

async function waitForAuthenticatedUser() {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  return new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });

    window.setTimeout(() => {
      unsubscribe();
      resolve(auth.currentUser);
    }, 1500);
  });
}

export async function ensureGamesAuthenticated() {
  const user = await waitForAuthenticatedUser();

  if (!user) {
    throw new Error(GAMES_AUTH_ERROR_MESSAGE);
  }

  return user;
}

function readText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();

    if (normalized) {
      return normalized;
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

function readOptionalNumber(
  ...values: Array<number | string | null | undefined>
): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number.parseFloat(value);

      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function readTimestamp(...values: Array<Timestamp | null | undefined>) {
  return values.find((value) => value instanceof Timestamp) ?? null;
}

function toDateString(timestamp: Timestamp | null) {
  return timestamp ? timestamp.toDate().toISOString() : null;
}

function normalizePrizeValue(value: string) {
  const normalized = value.trim().replace(",", ".");

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function buildSecondaryPrizeId(index: number) {
  return `secondary-prize-${index + 1}`;
}

function mapSecondaryPrize(
  prize: FirestoreSecondaryPrizeDocument,
  index: number,
): GameSecondaryPrize {
  return {
    id: buildSecondaryPrizeId(index),
    name: readText(prize.name),
    description: readText(prize.description),
    count:
      prize.count === undefined || prize.count === null
        ? ""
        : typeof prize.count === "number"
          ? String(Math.trunc(prize.count))
          : prize.count.trim(),
    image: readNullableText(prize.image),
  };
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

function normalizeStatus(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();

  switch (normalized) {
    case "active":
    case "actif":
    case "public":
      return "actif" as const;
    case "expired":
    case "expire":
    case "expiré":
    case "termine":
    case "terminé":
      return "expire" as const;
    case "draft":
    case "brouillon":
    case "inactive":
    case "inactif":
      return "brouillon" as const;
    case "private":
    case "prive":
    case "privé":
      return "prive" as const;
    default:
      return null;
  }
}

function deriveStatus(game: FirestoreGameDocument, now = Date.now()): GameStatus {
  const explicitStatus = normalizeStatus(game.status);
  const isPrivate = game.isPrivate === true || game.private === true;
  const isPublic = game.visible_public !== false;
  const endTimestamp = readTimestamp(game.end_date, game.endDate);
  const endValue = endTimestamp?.toMillis() ?? null;
  const startTimestamp = readTimestamp(game.start_date, game.startDate);
  const startValue = startTimestamp?.toMillis() ?? null;

  if (explicitStatus) {
    return explicitStatus;
  }

  if (isPrivate) {
    return "prive";
  }

  if (endValue !== null && endValue < now) {
    return "expire";
  }

  if (!isPublic) {
    return "brouillon";
  }

  if (startValue !== null && startValue > now) {
    return "brouillon";
  }

  return "actif";
}

async function pickCollectionName<TName extends string>(
  names: readonly TName[],
  preferred: TName,
) {
  let firstReadable: TName | null = null;

  for (const name of names) {
    try {
      const snapshot = await getDocs(query(collection(db, name), limit(1)));

      if (!firstReadable) {
        firstReadable = name;
      }

      if (!snapshot.empty) {
        return name;
      }
    } catch {
      continue;
    }
  }

  return firstReadable ?? preferred;
}

function mapMerchantOption(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  collectionName: MerchantCollectionName,
): GameMerchantOption {
  const merchant = snapshot.data() as FirestoreMerchantDocument;

  return {
    id: snapshot.id,
    name: readText(merchant.name, merchant.title, merchant.merchantName, "Marchand sans nom"),
    collectionName,
  };
}

function mapGameDocument(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  collectionName: GameCollectionName,
  merchantsById: Map<string, GameMerchantOption>,
): Game {
  const game = snapshot.data() as FirestoreGameDocument;
  const title = readText(game.title, game.name, "Jeu sans titre");
  const description = readText(game.description, game.conditions);
  const merchantId = readMerchantId(game.enseigne_id, game.merchantId ?? game.merchant_id ?? null);
  const merchantName =
    readNullableText(
      game.merchantName,
      game.enseigne_name,
      merchantId ? merchantsById.get(merchantId)?.name : null,
    ) ?? "Marchand inconnu";
  const startTimestamp = readTimestamp(game.start_date, game.startDate);
  const endTimestamp = readTimestamp(game.end_date, game.endDate);
  const imageUrl = readNullableText(game.imageUrl, game.photo, game.coverUrl);
  const status = deriveStatus(game);
  const hasMainPrize = readBoolean(game.hasMainPrize, false);
  const mainPrizeValue = readOptionalNumber(game.prize_value);
  const secondaryPrizes = Array.isArray(game.secondary_prizes)
    ? game.secondary_prizes.map((prize, index) => mapSecondaryPrize(prize ?? {}, index))
    : [];

  return {
    id: snapshot.id,
    title,
    description,
    merchantId,
    merchantName,
    startDate: toDateString(startTimestamp),
    endDate: toDateString(endTimestamp),
    startDateValue: startTimestamp?.toMillis() ?? null,
    endDateValue: endTimestamp?.toMillis() ?? null,
    status,
    imageUrl,
    isPrivate: status === "prive",
    sessionCount: readNumber(
      game.sessionCount,
      game.partiesCount,
      game.participations,
      game.participations_count,
    ),
    collectionName,
    imageMissing: !imageUrl,
    hasMainPrize,
    mainPrizeTitle: readText(game.main_prize_title),
    mainPrizeDescription: readText(game.main_prize_description),
    mainPrizeValue: mainPrizeValue === null ? "" : String(mainPrizeValue),
    mainPrizeImage: readNullableText(game.main_prize_image),
    secondaryPrizes,
    restrictedToAdults: readBoolean(game.restrictedToAdults, false),
  };
}

function buildStatusPatch(status: GameStatus) {
  return {
    status,
    visible_public: status === "actif" || status === "prive",
    isPrivate: status === "prive",
  };
}

function getMerchantReference(
  merchantCollectionName: MerchantCollectionName,
  merchantId: string | null,
) {
  if (!merchantId) {
    return null;
  }

  return doc(db, merchantCollectionName, merchantId);
}

function buildGamePatch(input: UpdateGameInput, imageUrl: string | null) {
  const startDate = input.startDate ? Timestamp.fromDate(new Date(input.startDate)) : null;
  const endDate = input.endDate ? Timestamp.fromDate(new Date(input.endDate)) : null;
  const merchantRef = getMerchantReference(input.merchantCollectionName, input.merchantId);
  const hasMainPrize = input.hasMainPrize;
  const mainPrizeValue = hasMainPrize ? normalizePrizeValue(input.mainPrizeValue) : null;
  const secondaryPrizes = input.secondaryPrizes
    .map((prize) => ({
      name: prize.name.trim(),
      description: prize.description.trim(),
      count: readNumber(prize.count, 0),
      image: prize.image?.trim() || "",
    }))
    .filter((prize) => prize.name || prize.description || prize.count > 0 || prize.image);

  return {
    title: input.title.trim(),
    name: input.title.trim(),
    description: input.description.trim(),
    conditions: input.description.trim(),
    merchantId: input.merchantId,
    merchant_id: input.merchantId,
    merchantName: input.merchantName.trim(),
    enseigne_name: input.merchantName.trim(),
    enseigne_id: merchantRef,
    merchantRef,
    startDate: startDate ?? null,
    start_date: startDate ?? null,
    endDate: endDate ?? null,
    end_date: endDate ?? null,
    imageUrl,
    photo: imageUrl,
    hasMainPrize,
    main_prize_title: hasMainPrize ? input.mainPrizeTitle.trim() : "",
    main_prize_description: hasMainPrize ? input.mainPrizeDescription.trim() : "",
    prize_value: hasMainPrize ? mainPrizeValue : null,
    main_prize_image: hasMainPrize ? input.mainPrizeImage?.trim() || "" : "",
    secondary_prizes: secondaryPrizes,
    restrictedToAdults: input.restrictedToAdults,
    ...buildStatusPatch(input.status),
  };
}

export async function getGamesAdminData(): Promise<GamesAdminData> {
  await ensureGamesAuthenticated();

  const [gameCollection, merchantCollection] = await Promise.all([
    pickCollectionName(["games", "jeux"] as const, "games"),
    pickCollectionName(["enseignes", "merchants"] as const, "enseignes"),
  ]);

  const [gamesSnapshot, merchantsSnapshot] = await Promise.all([
    getDocs(collection(db, gameCollection)),
    getDocs(collection(db, merchantCollection)),
  ]);

  const merchants = merchantsSnapshot.docs
    .map((snapshot) => mapMerchantOption(snapshot, merchantCollection))
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));

  const merchantsById = new Map(merchants.map((merchant) => [merchant.id, merchant]));

  const games = gamesSnapshot.docs
    .map((snapshot) => mapGameDocument(snapshot, gameCollection, merchantsById))
    .sort((left, right) => (left.endDateValue ?? 0) - (right.endDateValue ?? 0));

  return {
    games,
    merchants,
    gameCollection,
    merchantCollection,
  };
}

export async function updateGameStatus(input: UpdateGameStatusInput) {
  await ensureGamesAuthenticated();
  await updateDoc(doc(db, input.collectionName, input.gameId), buildStatusPatch(input.status));
}

export async function validateGameCoverFile(file: File) {
  if (!VALID_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Formats acceptes: JPG, PNG ou WEBP uniquement.");
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("L image depasse 2 Mo.");
  }
}

export async function uploadGameCover(gameId: string, file: File) {
  await validateGameCoverFile(file);

  const extension =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storageRef = ref(storage, `games/${gameId}/cover.${extension}`);

  await uploadBytes(storageRef, file, {
    contentType: file.type,
  });

  return getDownloadURL(storageRef);
}

async function uploadPrizeImage(gameId: string, folderName: string, file: File) {
  await validateGameCoverFile(file);

  const extension =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storageRef = ref(storage, `games/${gameId}/${folderName}.${extension}`);

  await uploadBytes(storageRef, file, {
    contentType: file.type,
  });

  return getDownloadURL(storageRef);
}

export async function updateGame(input: UpdateGameInput) {
  await ensureGamesAuthenticated();

  let finalImageUrl = input.imageUrl;
  let finalMainPrizeImage = input.mainPrizeImage;
  const finalSecondaryPrizes = [...input.secondaryPrizes];

  if (input.imageFile) {
    finalImageUrl = await uploadGameCover(input.gameId, input.imageFile);
  }

  if (input.mainPrizeImageFile) {
    finalMainPrizeImage = await uploadPrizeImage(input.gameId, "main-prize", input.mainPrizeImageFile);
  }

  if (input.secondaryPrizeImageFiles?.length) {
    await Promise.all(
      input.secondaryPrizeImageFiles.map(async (file, index) => {
        if (!file || !finalSecondaryPrizes[index]) {
          return;
        }

        finalSecondaryPrizes[index] = {
          ...finalSecondaryPrizes[index],
          image: await uploadPrizeImage(input.gameId, `secondary-prize-${index + 1}`, file),
        };
      }),
    );
  }

  await updateDoc(
    doc(db, input.collectionName, input.gameId),
    buildGamePatch(
      {
        ...input,
        mainPrizeImage: finalMainPrizeImage,
        secondaryPrizes: finalSecondaryPrizes,
      },
      finalImageUrl,
    ),
  );

  return {
    imageUrl: finalImageUrl,
    mainPrizeImage: finalMainPrizeImage,
    secondaryPrizes: finalSecondaryPrizes,
  };
}

export async function duplicateGameDocument(
  input: DuplicateGameInput,
  merchantCollectionName: MerchantCollectionName = "enseignes",
): Promise<DuplicateGameResult> {
  await ensureGamesAuthenticated();

  const adminData = await getGamesAdminData();
  const original = adminData.games.find((game) => game.id === input.gameId);

  if (!original) {
    throw new Error("Le jeu a dupliquer est introuvable.");
  }

  const now = new Date();
  const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const merchantRef = getMerchantReference(merchantCollectionName, original.merchantId);

  const payload = {
    // Pas de préfixe [Copie] — titre identique à l'original
    title: original.title,
    name: original.title,
    description: original.description,
    conditions: original.description,
    merchantId: original.merchantId,
    merchant_id: original.merchantId,
    merchantName: original.merchantName,
    enseigne_name: original.merchantName,
    enseigne_id: merchantRef,
    merchantRef,
    startDate: Timestamp.fromDate(now),
    start_date: Timestamp.fromDate(now),
    endDate: Timestamp.fromDate(endDate),
    end_date: Timestamp.fromDate(endDate),
    imageUrl: original.imageUrl,
    photo: original.imageUrl,
    sessionCount: 0,
    partiesCount: 0,
    hasMainPrize: original.hasMainPrize,
    main_prize_title: original.mainPrizeTitle,
    main_prize_description: original.mainPrizeDescription,
    prize_value: normalizePrizeValue(original.mainPrizeValue),
    main_prize_image: original.mainPrizeImage ?? "",
    secondary_prizes: original.secondaryPrizes.map((prize) => ({
      name: prize.name,
      description: prize.description,
      count: readNumber(prize.count, 0),
      image: prize.image ?? "",
    })),
    restrictedToAdults: original.restrictedToAdults,
    ...buildStatusPatch("brouillon"),
  };

  const createdRef = await addDoc(collection(db, input.collectionName), payload);

  return {
    game: {
      id: createdRef.id,
      title: payload.title,
      description: payload.description,
      merchantId: original.merchantId,
      merchantName: original.merchantName,
      startDate: now.toISOString(),
      endDate: endDate.toISOString(),
      startDateValue: now.getTime(),
      endDateValue: endDate.getTime(),
      status: "brouillon",
      imageUrl: original.imageUrl,
      isPrivate: false,
      sessionCount: 0,
      collectionName: input.collectionName,
      imageMissing: !original.imageUrl,
      hasMainPrize: original.hasMainPrize,
      mainPrizeTitle: original.mainPrizeTitle,
      mainPrizeDescription: original.mainPrizeDescription,
      mainPrizeValue: original.mainPrizeValue,
      mainPrizeImage: original.mainPrizeImage,
      secondaryPrizes: original.secondaryPrizes.map((prize) => ({ ...prize })),
      restrictedToAdults: original.restrictedToAdults,
    },
  };
}

export function getGamesQueryErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "permission-denied":
        return "Impossible de lire ou modifier les jeux avec cette session.";
      case "unavailable":
        return "Firestore ou Storage est temporairement indisponible.";
      default:
        return error.message || "Une erreur Firebase a bloque l operation.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Une erreur inattendue a bloque l operation.";
}
