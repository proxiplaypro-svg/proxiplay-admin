"use client";

import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { PushNotification } from "@/types/dashboard";
import { auth } from "./auth";
import { db, firebaseApp } from "./client-app";

type FirestoreUserDocument = {
  email?: string;
  display_name?: string;
  full_name?: string;
  name?: string;
  pseudo?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  phone?: string;
  platform?: string;
  device_platform?: string;
  os?: string;
  created_time?: Timestamp;
  created_at?: Timestamp;
  last_real_activity_at?: Timestamp;
  referralCount?: number | string;
  referrals_count?: number | string;
  accepted_referrals_count?: number | string;
  user_role?: string;
};

type FirestorePushNotificationDocument = {
  notification_title?: string;
  notification_text?: string;
  notification_image_url?: string;
  notification_sound?: string;
  initial_page_name?: string;
  parameter_data?: string;
  created_at?: Timestamp;
  scheduled_time?: Timestamp;
  status?: string;
  target_audience?: string;
  target_user_group?: string;
  user_refs?: string;
  notification_delivery_state?: unknown;
  attempted_tokens?: number | string;
  num_sent?: number | string;
  num_failed?: number | string;
  delivered_count?: number | string;
  sent_count?: number | string;
  success_count?: number | string;
  failed_count?: number | string;
  failure_count?: number | string;
};

export type NotificationTabAudience = "all" | "segment" | "single";
export type NotificationSegmentId =
  | "ios_inactifs_j7"
  | "inactifs_j30"
  | "nouveaux_j7"
  | "ambassadeurs"
  | "commercants";

export type NotificationRecipientUser = {
  id: string;
  displayName: string;
  email: string;
  initials: string;
  platform: string;
  userRole: string;
  createdAtValue: number;
  lastActivityValue: number;
  referralsCount: number;
  phone: string;
  pushAvailable: boolean | null;
};

export type NotificationAudienceSnapshot = {
  users: NotificationRecipientUser[];
  allUsersCount: number;
  segments: Record<NotificationSegmentId, number>;
};

// Les 5 types techniques valides serveur (voir
// firebase/functions/notification_destination.js, source de verite).
// "Accueil" et "Un ecran ProxiPlay" sont tous deux portes par "internal" --
// seul destination_id change (voir INTERNAL_DESTINATION_OPTIONS ci-dessous).
export type NotificationDestinationType = "none" | "game" | "merchant" | "internal" | "external_url";

export type CreatePushNotificationInput = {
  title: string;
  message: string;
  imageUrl: string;
  destinationType: NotificationDestinationType;
  destinationId: string;
  audienceMode: NotificationTabAudience;
  segmentId: NotificationSegmentId | "All";
  userUid: string;
  scheduledAt: Date | null;
};

const NOTIFICATIONS_AUTH_ERROR_MESSAGE = "Connexion requise pour gerer les notifications.";

// The mobile Firebase backend exposes this v1 callable in its default region.
// It owns the ff_push_notifications queue contract.
const pushNotificationsFunctions = getFunctions(firebaseApp, "us-central1");

type CreateAdminPushNotificationPayload = {
  title: string;
  body: string;
  imageUrl: string;
  targetDevice: string;
  targetUserGroup: string;
  userRefs: string[];
  scheduledTimeMs?: number;
  destinationType: NotificationDestinationType;
  destinationId: string;
};

type CreateAdminPushNotificationResult = {
  ok: boolean;
  id: string;
};

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

async function ensureNotificationsAuthenticated() {
  const user = await waitForAuthenticatedUser();

  if (!user) {
    throw new Error(NOTIFICATIONS_AUTH_ERROR_MESSAGE);
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

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
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

function readOptionalNumber(...values: Array<number | string | null | undefined>) {
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

  return null;
}

function formatDateTime(value: number) {
  if (value <= 0) {
    return "Non renseigne";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildInitials(displayName: string, email: string) {
  const source = displayName || email || "PP";
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "PP";
}

function normalizePlatform(user: FirestoreUserDocument) {
  return readText(user.platform, user.device_platform, user.os).toLowerCase();
}

function extractDeliveryCount(data: FirestorePushNotificationDocument) {
  const fromTopLevel = readOptionalNumber(
    data.num_sent,
    data.delivered_count,
    data.sent_count,
    data.success_count,
  );
  if (fromTopLevel !== null) return fromTopLevel;

  if (data.notification_delivery_state && typeof data.notification_delivery_state === "object") {
    const state = data.notification_delivery_state as Record<string, unknown>;
    return readOptionalNumber(
      state.num_sent as number | string | undefined,
      state.delivered_count as number | string | undefined,
      state.sent_count as number | string | undefined,
      state.success_count as number | string | undefined,
      state.total as number | string | undefined,
    );
  }

  return null;
}

function extractDeliveryFailureCount(data: FirestorePushNotificationDocument) {
  const fromTopLevel = readOptionalNumber(data.num_failed, data.failed_count, data.failure_count);
  if (fromTopLevel !== null) return fromTopLevel;

  if (data.notification_delivery_state && typeof data.notification_delivery_state === "object") {
    const state = data.notification_delivery_state as Record<string, unknown>;
    return readOptionalNumber(
      state.num_failed as number | string | undefined,
      state.failed_count as number | string | undefined,
      state.failure_count as number | string | undefined,
    );
  }

  return null;
}

function extractDeliveryAttemptCount(data: FirestorePushNotificationDocument) {
  const fromTopLevel = readOptionalNumber(data.attempted_tokens);
  if (fromTopLevel !== null) return fromTopLevel;

  if (data.notification_delivery_state && typeof data.notification_delivery_state === "object") {
    const state = data.notification_delivery_state as Record<string, unknown>;
    return readOptionalNumber(state.attempted_tokens as number | string | undefined);
  }

  return null;
}

export function getPushNotificationDeliveryCounts(data: FirestorePushNotificationDocument) {
  return {
    sent: extractDeliveryCount(data),
    failed: extractDeliveryFailureCount(data),
    attempted: extractDeliveryAttemptCount(data),
  };
}

export function formatPushNotificationDelivery(
  sentCount: number | null,
  failedCount: number | null,
  attemptedCount: number | null,
) {
  if (sentCount === null && failedCount === null && attemptedCount === null) return null;

  const parts: string[] = [];
  if (sentCount !== null) {
    parts.push(`${sentCount} envoy${sentCount === 1 ? "é" : "és"}`);
  } else if (attemptedCount !== null) {
    parts.push(`${attemptedCount} tentative${attemptedCount === 1 ? "" : "s"}`);
  }
  if (failedCount !== null && failedCount > 0) {
    parts.push(`${failedCount} échec${failedCount === 1 ? "" : "s"}`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function buildPushNotificationTarget(
  audienceMode: NotificationTabAudience,
  segmentId: NotificationSegmentId | "All",
  userUid: string,
) {
  if (audienceMode === "single") {
    const normalizedUid = userUid.trim().replace(/^(?:users\/)+/, "");

    if (!normalizedUid) {
      throw new Error("Un joueur cible est obligatoire pour une notification individuelle.");
    }

    // FlutterFlow routes an individual notification from this user document path.
    // Keep the audience fields aligned with successful existing notifications.
    return {
      target_audience: "All",
      target_user_group: "All",
      user_refs: `users/${normalizedUid}`,
    };
  }

  if (audienceMode === "segment") {
    return {
      target_audience: segmentId,
      target_user_group: segmentId,
      user_refs: "",
    };
  }

  return {
    target_audience: "All",
    target_user_group: "All",
    user_refs: "",
  };
}

export function buildCreateAdminPushNotificationPayload(input: CreatePushNotificationInput): CreateAdminPushNotificationPayload {
  const target = buildPushNotificationTarget(input.audienceMode, input.segmentId, input.userUid);
  const scheduledTimeMs = input.scheduledAt?.getTime();

  if (scheduledTimeMs !== undefined && !Number.isFinite(scheduledTimeMs)) {
    throw new Error("La date de programmation est invalide.");
  }

  return {
    title: input.title.trim(),
    body: input.message.trim(),
    imageUrl: input.imageUrl.trim(),
    targetDevice: target.target_audience,
    targetUserGroup: target.target_user_group,
    userRefs: target.user_refs ? [target.user_refs] : [],
    destinationType: input.destinationType,
    destinationId: input.destinationId.trim(),
    ...(scheduledTimeMs === undefined ? {} : { scheduledTimeMs }),
  };
}

export function isTargetedUserReference(userRefs: string) {
  return /^users\/[^/]+$/.test(userRefs.trim());
}

function mapNotificationDocument(id: string, data: FirestorePushNotificationDocument): PushNotification {
  const createdAtValue = data.created_at?.toMillis() ?? 0;
  const scheduledTimeValue = data.scheduled_time?.toMillis() ?? createdAtValue;
  const delivery = getPushNotificationDeliveryCounts(data);

  return {
    id,
    title: readText(data.notification_title, "Sans titre"),
    message: readText(data.notification_text),
    imageUrl: readText(data.notification_image_url),
    sound: readText(data.notification_sound),
    initialPageName: readText(data.initial_page_name),
    parameterData: readText(data.parameter_data),
    scheduledTimeLabel: formatDateTime(scheduledTimeValue),
    scheduledTimeValue,
    createdAtLabel: formatDateTime(createdAtValue),
    createdAtValue,
    status: readText(data.status, "pending"),
    targetAudience: isTargetedUserReference(readText(data.user_refs))
      ? "Joueur spécifique"
      : readText(data.target_audience, "All"),
    targetUserGroup: readText(data.target_user_group, "All"),
    userRefs: readText(data.user_refs),
    deliveryCount: delivery.sent,
    deliveryFailureCount: delivery.failed,
    deliveryAttemptCount: delivery.attempted,
  };
}

export async function getNotificationsAudienceSnapshot(): Promise<NotificationAudienceSnapshot> {
  await ensureNotificationsAuthenticated();

  const snapshot = await getDocs(collection(db, "users"));
  const now = Date.now();
  const j7 = now - 7 * 24 * 60 * 60 * 1000;
  const j30 = now - 30 * 24 * 60 * 60 * 1000;
  const users = snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data() as FirestoreUserDocument;
    const displayName = readText(
      data.display_name,
      data.full_name,
      data.name,
      data.pseudo,
      [readText(data.first_name, data.last_name)].filter(Boolean).join(" "),
      data.email,
      "Joueur sans nom",
    );
    const email = readText(data.email, "Email non renseigne");

    return {
      id: docSnapshot.id,
      displayName,
      email,
      initials: buildInitials(displayName, email),
      platform: normalizePlatform(data),
      userRole: readText(data.user_role),
      phone: readText(data.phone_number, data.phone),
      pushAvailable: null,
      createdAtValue: data.created_time?.toMillis() ?? data.created_at?.toMillis() ?? 0,
      lastActivityValue: data.last_real_activity_at?.toMillis() ?? 0,
      referralsCount: readNumber(
        data.referralCount,
        data.referrals_count,
        data.accepted_referrals_count,
      ),
    } satisfies NotificationRecipientUser;
  });

  return {
    users,
    allUsersCount: users.length,
    segments: {
      ios_inactifs_j7: users.filter(
        (user) => user.platform.includes("ios") && (user.lastActivityValue === 0 || user.lastActivityValue < j7),
      ).length,
      inactifs_j30: users.filter(
        (user) => user.lastActivityValue === 0 || user.lastActivityValue < j30,
      ).length,
      nouveaux_j7: users.filter((user) => user.createdAtValue >= j7).length,
      ambassadeurs: users.filter((user) => user.referralsCount >= 5).length,
      commercants: users.filter((user) => user.userRole === "commercant").length,
    },
  };
}

export async function searchNotificationUsers(search: string) {
  await ensureNotificationsAuthenticated();

  const normalized = normalizeSearchText(search);
  if (normalized.length < 2) {
    return [] as NotificationRecipientUser[];
  }

  const snapshot = await getDocs(
    query(collection(db, "user_search_index"), where("search_terms", "array-contains", normalized), limit(10)),
  );

  return snapshot.docs
    .map((docSnapshot) => {
      const data = docSnapshot.data() as {
        display_name?: string; email?: string; phone?: string; platform?: string; user_role?: string;
      };
      const displayName = readText(data.display_name, data.email, "Joueur sans nom");
      const email = readText(data.email, "Email non renseigne");

      return {
        id: docSnapshot.id,
        displayName,
        email,
        initials: buildInitials(displayName, email),
        platform: readText(data.platform).toLowerCase(),
        userRole: readText(data.user_role),
        phone: readText(data.phone),
        pushAvailable: null,
        createdAtValue: 0,
        lastActivityValue: 0,
        referralsCount: 0,
      } satisfies NotificationRecipientUser;
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "fr"));
}

export async function getNotificationRecipientPushAvailability(userId: string) {
  await ensureNotificationsAuthenticated();
  const tokens = await getDocs(query(collection(db, "users", userId, "fcm_tokens"), limit(1)));
  return !tokens.empty;
}

// Validation client, en complement de la validation serveur (qui reste la
// source de verite -- voir firebase/functions/notification_destination.js).
// Permet d'afficher une erreur immediate dans le formulaire avant l'envoi.
export function getNotificationDestinationValidationError(
  destinationType: NotificationDestinationType,
  destinationId: string,
): string | null {
  const id = destinationId.trim();

  switch (destinationType) {
    case "none":
      return null;
    case "game":
      return id ? null : "Selectionne un jeu pour cette destination.";
    case "merchant":
      return id ? null : "Selectionne un commerce pour cette destination.";
    case "internal":
      return id ? null : "Selectionne un ecran ProxiPlay pour cette destination.";
    case "external_url":
      if (!id) return "Renseigne l URL de destination.";
      try {
        return new URL(id).protocol === "https:" ? null : "L URL doit commencer par https://.";
      } catch {
        return "L URL de destination est invalide.";
      }
    default:
      return "Type de destination invalide.";
  }
}

export async function createPushNotification(input: CreatePushNotificationInput) {
  await ensureNotificationsAuthenticated();
  const title = input.title.trim();
  const message = input.message.trim();
  const isMerchantSegment = input.audienceMode === "segment" && input.segmentId === "commercants";

  if (!title || !message) {
    throw new Error("Titre et message sont obligatoires.");
  }

  const destinationError = getNotificationDestinationValidationError(
    input.destinationType,
    input.destinationId,
  );
  if (destinationError) {
    throw new Error(destinationError);
  }

  if (isMerchantSegment) {
    throw new Error(
      "Le segment commercants est temporairement suspendu tant que le ciblage par jeu actif n est pas corrige.",
    );
  }

  const payload = buildCreateAdminPushNotificationPayload(input);
  const create = httpsCallable<CreateAdminPushNotificationPayload, CreateAdminPushNotificationResult>(
    pushNotificationsFunctions,
    "createAdminPushNotification",
  );
  const result = await create(payload);

  if (!result.data?.ok || !result.data.id) {
    throw new Error("Le moteur de notifications n a pas confirme la creation de la notification.");
  }

  return result.data.id;
}

export async function getLatestPushNotifications() {
  await ensureNotificationsAuthenticated();

  const snapshot = await getDocs(
    query(collection(db, "ff_push_notifications"), orderBy("created_at", "desc"), limit(20)),
  );

  return snapshot.docs.map((docSnapshot) =>
    mapNotificationDocument(docSnapshot.id, docSnapshot.data() as FirestorePushNotificationDocument),
  );
}

export function getNotificationsErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "permission-denied":
      case "functions/permission-denied":
        return "Impossible d acceder aux notifications avec cette session.";
      case "failed-precondition":
      case "functions/failed-precondition":
        return "Le moteur de notifications a refuse cette demande.";
      case "unavailable":
      case "functions/unavailable":
        return "Le moteur de notifications est temporairement indisponible.";
      case "functions/not-found":
        return "Le moteur de notifications est indisponible. Contacte un administrateur technique.";
      default:
        return error.message || "Une erreur Firebase a bloque l operation notifications.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Une erreur inattendue a bloque l operation notifications.";
}
