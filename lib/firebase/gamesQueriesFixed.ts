"use client";

import {
  collection,
  deleteField,
  doc,
  getDoc,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
  type DocumentReference,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { Game, GameSecondaryPrize, GameStatus } from "@/types/dashboard";
import { db, storage } from "./client-app";
import {
  ensureGamesAuthenticated,
  uploadGameCover,
  validateGameCoverFile,
  type CreateGameInput,
  type CreateGameResult,
  type DuplicateGameInput,
  type DuplicateGameResult,
  type UpdateGameInput,
} from "./gamesQueries";

export * from "./gamesQueries";

type MerchantCollectionName = "enseignes" | "merchants";

type MerchantOwnerDocument = {
  owner?: DocumentReference | string | { id?: string; path?: string } | null;
  owner_id?: DocumentReference | null;
};

function readNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePrizeValue(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildStatusPatch(status: GameStatus) {
  return {
    status,
    visible_public: status === "actif" || status === "prive",
    isPrivate: status === "prive",
  };
}

function extractUserIdFromOwner(owner?: MerchantOwnerDocument["owner"]) {
  if (!owner) return null;
  if (typeof owner === "string") {
    const match = owner.match(/(?:^|\/)users\/([^/]+)$/);
    return match?.[1] ?? null;
  }
  if ("id" in owner && typeof owner.id === "string" && owner.id) return owner.id;
  if ("path" in owner && typeof owner.path === "string") {
    const match = owner.path.match(/(?:^|\/)users\/([^/]+)$/);
    return match?.[1] ?? null;
  }
  return null;
}

function getMerchantOwnerReference(merchant?: MerchantOwnerDocument): DocumentReference | null {
  if (!merchant) return null;
  if (merchant.owner_id) return merchant.owner_id;
  const ownerId = extractUserIdFromOwner(merchant.owner);
  return ownerId ? doc(db, "users", ownerId) : null;
}

async function resolveMerchantOwnerReference(
  merchantCollectionName: MerchantCollectionName,
  merchantId: string | null,
) {
  if (!merchantId) return null;
  const merchantSnapshot = await getDoc(doc(db, merchantCollectionName, merchantId));
  return getMerchantOwnerReference(
    merchantSnapshot.data() as MerchantOwnerDocument | undefined,
  );
}

async function uploadPrizeImage(gameId: string, folderName: string, file: File) {
  await validateGameCoverFile(file);
  const extension =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storageRef = ref(storage, `games/${gameId}/${folderName}.${extension}`);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}

function mapSecondaryPrizesForWrite(prizes: GameSecondaryPrize[]) {
  return prizes
    .map((prize) => ({
      presentation: prize.description.trim(),
      name: prize.name.trim(),
      description: prize.description.trim(),
      count: Math.max(0, Math.trunc(readNumber(prize.count, 0))),
      image: prize.image?.trim() || "",
    }))
    .filter((prize) => prize.name || prize.description || prize.count > 0 || prize.image);
}

/**
 * Edits an existing game without ever resetting historical state.
 * In particular, created_time and hasWinner are deliberately untouched.
 */
export async function updateGame(input: UpdateGameInput) {
  const user = await ensureGamesAuthenticated();
  const ownerRef = await resolveMerchantOwnerReference(
    input.merchantCollectionName,
    input.merchantId,
  );

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
        if (!file || !finalSecondaryPrizes[index]) return;
        finalSecondaryPrizes[index] = {
          ...finalSecondaryPrizes[index],
          image: await uploadPrizeImage(input.gameId, `secondary-prize-${index + 1}`, file),
        };
      }),
    );
  }

  const startDate = input.startDate ? Timestamp.fromDate(new Date(input.startDate)) : null;
  const endDate = input.endDate ? Timestamp.fromDate(new Date(input.endDate)) : null;
  const merchantRef = input.merchantId
    ? doc(db, input.merchantCollectionName, input.merchantId)
    : null;
  const mainPrizeValue = input.hasMainPrize
    ? normalizePrizeValue(input.mainPrizeValue)
    : null;

  if (input.hasMainPrize && mainPrizeValue === null) {
    throw new Error("La valeur du lot principal doit etre un nombre valide.");
  }

  const patch = {
    title: input.title.trim(),
    name: input.title.trim(),
    create_by: ownerRef ?? doc(db, "users", user.uid),
    description: input.description.trim(),
    conditions: input.description.trim(),
    merchantId: input.merchantId,
    merchant_id: input.merchantId,
    merchantName: input.merchantName.trim(),
    enseigne_name: input.merchantName.trim(),
    enseigne_id: merchantRef,
    merchantRef,
    ...(input.animationId
      ? { animation_id: input.animationId }
      : { animation_id: deleteField() }),
    startDate,
    start_date: startDate,
    endDate,
    end_date: endDate,
    game_type: "scratcher",
    imageUrl: finalImageUrl,
    photo: finalImageUrl,
    hasMainPrize: input.hasMainPrize,
    main_prize_title: input.hasMainPrize ? input.mainPrizeTitle.trim() : "",
    main_prize_description: input.hasMainPrize ? input.mainPrizeDescription.trim() : "",
    ...(input.hasMainPrize
      ? { prize_value: mainPrizeValue }
      : { prize_value: deleteField() }),
    main_prize_image: input.hasMainPrize ? finalMainPrizeImage?.trim() || "" : "",
    secondary_prizes: mapSecondaryPrizesForWrite(finalSecondaryPrizes),
    prohibited_for_minors: input.restrictedToAdults,
    restrictedToAdults: input.restrictedToAdults,
    updated_at: Timestamp.now(),
    ...buildStatusPatch(input.status),
  };

  await updateDoc(doc(db, input.collectionName, input.gameId), patch);

  return {
    imageUrl: finalImageUrl,
    mainPrizeImage: finalMainPrizeImage,
    secondaryPrizes: finalSecondaryPrizes,
  };
}

/** Creates a game for the selected merchant and attributes create_by to its owner account. */
export async function createGame(input: CreateGameInput): Promise<CreateGameResult> {
  const user = await ensureGamesAuthenticated();

  if (!input.merchantId) throw new Error("Choisis un commerçant.");
  if (!input.title.trim()) throw new Error("Le titre est obligatoire.");

  const startDate = new Date(`${input.startDate}T00:00:00`);
  const endDate = new Date(`${input.endDate}T23:59:59`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Les dates de début et de fin sont obligatoires.");
  }
  if (startDate.getTime() >= endDate.getTime()) {
    throw new Error("La date de début doit être avant la date de fin.");
  }

  const prizeValue = input.prizeValue.trim() ? normalizePrizeValue(input.prizeValue) : null;
  if (input.prizeValue.trim() && prizeValue === null) {
    throw new Error("La valeur du lot doit être un nombre positif.");
  }

  const merchantRef = doc(db, input.merchantCollectionName, input.merchantId);
  const ownerRef = await resolveMerchantOwnerReference(
    input.merchantCollectionName,
    input.merchantId,
  );
  const gameRef = doc(collection(db, input.collectionName));
  const now = new Date();

  let imageUrl: string | null = null;
  if (input.imageFile) imageUrl = await uploadGameCover(gameRef.id, input.imageFile);

  const description = input.description.trim();
  const qrLink = `https://play.proxiplay.fr/j/${gameRef.id}`;
  const secondaryPrizes = input.secondaryPrizes
    .map((prize) => ({
      presentation: prize.description.trim(),
      name: prize.name.trim(),
      description: prize.description.trim(),
      count: Math.max(0, Math.trunc(readNumber(prize.count, 0))),
      image: "",
    }))
    .filter((prize) => prize.name || prize.description || prize.count > 0);

  const payload = {
    title: input.title.trim(),
    name: input.title.trim(),
    create_by: ownerRef ?? doc(db, "users", user.uid),
    description,
    conditions: description,
    merchantId: input.merchantId,
    merchant_id: input.merchantId,
    merchantName: input.merchantName,
    enseigne_name: input.merchantName,
    enseigne_id: merchantRef,
    merchantRef,
    startDate: Timestamp.fromDate(startDate),
    start_date: Timestamp.fromDate(startDate),
    endDate: Timestamp.fromDate(endDate),
    end_date: Timestamp.fromDate(endDate),
    game_type: "scratcher",
    type: "standard",
    access_mode: input.accessMode,
    created_time: Timestamp.fromDate(now),
    hasWinner: false,
    imageUrl: imageUrl ?? "",
    photo: imageUrl ?? "",
    sessionCount: 0,
    partiesCount: 0,
    hasMainPrize: prizeValue !== null,
    main_prize_title: description,
    main_prize_description: description,
    ...(prizeValue !== null ? { prize_value: prizeValue } : {}),
    main_prize_image: "",
    secondary_prizes: secondaryPrizes,
    prohibited_for_minors: input.restrictedToAdults,
    restrictedToAdults: input.restrictedToAdults,
    qr_link: qrLink,
    qr_target: "game_detail",
    qr_version: 2,
    qr_created_at: Timestamp.fromDate(now),
    views: 0,
    favorites: 0,
    participations: 0,
    ...buildStatusPatch("brouillon"),
  };

  await setDoc(gameRef, payload);

  return {
    game: {
      id: gameRef.id,
      title: input.title.trim(),
      description,
      merchantId: input.merchantId,
      merchantName: input.merchantName,
      animationId: null,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      startDateValue: startDate.getTime(),
      endDateValue: endDate.getTime(),
      status: "brouillon",
      imageUrl,
      isPrivate: false,
      sessionCount: 0,
      collectionName: input.collectionName,
      imageMissing: !imageUrl,
      hasMainPrize: prizeValue !== null,
      mainPrizeTitle: description,
      mainPrizeDescription: description,
      mainPrizeValue: prizeValue === null ? "" : String(prizeValue),
      mainPrizeImage: null,
      secondaryPrizes: secondaryPrizes.map((prize, index) => ({
        id: `secondary-${index}`,
        name: prize.name,
        description: prize.description,
        count: String(prize.count),
        image: null,
      })),
      restrictedToAdults: input.restrictedToAdults,
    },
  };
}

function timestampFromSource(data: DocumentData, snake: string, camel: string) {
  const snakeValue = data[snake];
  if (snakeValue instanceof Timestamp) return snakeValue;
  const camelValue = data[camel];
  return camelValue instanceof Timestamp ? camelValue : null;
}

function mapSecondaryPrizesFromSource(value: unknown): GameSecondaryPrize[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    const prize = (raw ?? {}) as Record<string, unknown>;
    const description = readString(prize.presentation) || readString(prize.description);
    return {
      id: `secondary-prize-${index + 1}`,
      name: readString(prize.name),
      description,
      presentation: description,
      count: String(Math.max(0, Math.trunc(readNumber(prize.count, 0)))),
      image: readString(prize.image) || null,
    };
  });
}

/**
 * Duplicates configuration only. The duplicate is a brand-new draft with a
 * new id, creation date, QR link and zero history/counters/winners.
 */
export async function duplicateGameDocument(
  input: DuplicateGameInput,
  merchantCollectionName: MerchantCollectionName = "enseignes",
): Promise<DuplicateGameResult> {
  const user = await ensureGamesAuthenticated();
  const sourceRef = doc(db, input.collectionName, input.gameId);
  const sourceSnapshot = await getDoc(sourceRef);
  if (!sourceSnapshot.exists()) throw new Error("Le jeu a dupliquer est introuvable.");

  const source = sourceSnapshot.data();
  const merchantId =
    readString(source.merchantId) ||
    readString(source.merchant_id) ||
    (source.enseigne_id instanceof Object && "id" in source.enseigne_id
      ? readString((source.enseigne_id as { id?: string }).id)
      : "");
  const merchantName = readString(source.merchantName) || readString(source.enseigne_name);
  const merchantRef = merchantId ? doc(db, merchantCollectionName, merchantId) : null;
  const ownerRef = await resolveMerchantOwnerReference(
    merchantCollectionName,
    merchantId || null,
  );

  const createdRef = doc(collection(db, input.collectionName));
  const now = Timestamp.now();
  const startDate = timestampFromSource(source, "start_date", "startDate");
  const endDate = timestampFromSource(source, "end_date", "endDate");
  const hasMainPrize = readBoolean(source.hasMainPrize, false);
  const secondaryPrizes = Array.isArray(source.secondary_prizes)
    ? source.secondary_prizes.map((prize) => ({ ...(prize ?? {}) }))
    : [];
  const qrLink = `https://play.proxiplay.fr/j/${createdRef.id}`;

  const payload: Record<string, unknown> = {
    title: readString(source.title) || readString(source.name),
    name: readString(source.name) || readString(source.title),
    create_by: ownerRef ?? doc(db, "users", user.uid),
    description: readString(source.description),
    conditions: readString(source.conditions) || readString(source.description),
    merchantId: merchantId || null,
    merchant_id: merchantId || null,
    merchantName,
    enseigne_name: merchantName,
    enseigne_id: merchantRef,
    merchantRef,
    ...(source.animation_id ? { animation_id: source.animation_id } : {}),
    ...(source.campaign_id ? { campaign_id: source.campaign_id } : {}),
    startDate,
    start_date: startDate,
    endDate,
    end_date: endDate,
    game_type: readString(source.game_type, "scratcher"),
    type: readString(source.type, "standard"),
    access_mode: readString(source.access_mode, "public"),
    created_time: now,
    hasWinner: false,
    imageUrl: readString(source.imageUrl) || readString(source.photo) || readString(source.coverUrl),
    photo: readString(source.photo) || readString(source.imageUrl) || readString(source.coverUrl),
    hasMainPrize,
    main_prize_title: readString(source.main_prize_title),
    main_prize_description: readString(source.main_prize_description),
    main_prize_image: readString(source.main_prize_image),
    secondary_prizes: secondaryPrizes,
    prohibited_for_minors: readBoolean(
      source.prohibited_for_minors,
      readBoolean(source.restrictedToAdults, false),
    ),
    restrictedToAdults: readBoolean(
      source.restrictedToAdults,
      readBoolean(source.prohibited_for_minors, false),
    ),
    qr_link: qrLink,
    qr_target: readString(source.qr_target, "game_detail"),
    qr_version: readNumber(source.qr_version, 2),
    qr_created_at: now,
    sessionCount: 0,
    partiesCount: 0,
    participations: 0,
    participations_count: 0,
    views: 0,
    favorites: 0,
    ...buildStatusPatch("brouillon"),
  };

  if (source.prize_value !== undefined && source.prize_value !== null) {
    payload.prize_value = source.prize_value;
  }
  if (source.prize_usage_deadline instanceof Timestamp) {
    payload.prize_usage_deadline = source.prize_usage_deadline;
  }

  await setDoc(createdRef, payload);

  const imageUrl = readString(payload.imageUrl) || null;
  const mainPrizeValue = source.prize_value == null ? "" : String(source.prize_value);
  const mappedSecondaryPrizes = mapSecondaryPrizesFromSource(source.secondary_prizes);

  const game: Game = {
    id: createdRef.id,
    title: readString(payload.title),
    description: readString(payload.description),
    merchantId: merchantId || null,
    merchantName,
    animationId: readString(source.animation_id) || readString(source.campaign_id) || null,
    startDate: startDate?.toDate().toISOString() ?? null,
    endDate: endDate?.toDate().toISOString() ?? null,
    startDateValue: startDate?.toMillis() ?? null,
    endDateValue: endDate?.toMillis() ?? null,
    status: "brouillon",
    imageUrl,
    isPrivate: false,
    sessionCount: 0,
    collectionName: input.collectionName,
    imageMissing: !imageUrl,
    hasMainPrize,
    mainPrizeTitle: readString(source.main_prize_title),
    mainPrizeDescription: readString(source.main_prize_description),
    mainPrizeValue,
    mainPrizeImage: readString(source.main_prize_image) || null,
    secondaryPrizes: mappedSecondaryPrizes,
    restrictedToAdults: readBoolean(
      source.restrictedToAdults,
      readBoolean(source.prohibited_for_minors, false),
    ),
  };

  return { game };
}
