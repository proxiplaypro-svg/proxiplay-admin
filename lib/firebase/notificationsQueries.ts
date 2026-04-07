"use client";

import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import type { PushNotification } from "@/types/dashboard";
import { auth } from "./auth";
import { db } from "./client-app";

type FirestoreUserDocument = {
  email?: string;
  display_name?: string;
  full_name?: string;
  name?: string;
  pseudo?: string;
  first_name?: string;
  last_name?: string;
  platform?: string;
  device_platform?: string;
  os?: string;
  created_time?: Timestamp;
  created_at?: Timestamp;
  last_real_activity_at?: Timestamp;
  referralCount?: number | string;
  referrals_count?: number | string;
  accepted_referrals_count?: number | string;
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
  delivered_count?: number | string;
  sent_count?: number | string;
  success_count?: number | string;
};

export type NotificationTabAudience = "all" | "segment" | "single";
export type NotificationSegmentId =
  | "ios_inactifs_j7"
  | "inactifs_j30"
  | "nouveaux_j7"
  | "ambassadeurs";

export type NotificationRecipientUser = {
  id: string;
  displayName: string;
  email: string;
  initials: string;
  platform: string;
  createdAtValue: number;
  lastActivityValue: number;
  referralsCount: number;
};

export type NotificationAudienceSnapshot = {
  users: NotificationRecipientUser[];
  allUsersCount: number;
  segments: Record<NotificationSegmentId, number>;
};

export type CreatePushNotificationInput = {
  title: string;
  message: string;
  imageUrl: string;
  initialPageName: string;
  parameterData: string;
  audienceMode: NotificationTabAudience;
  segmentId: string;
  userUid: string;
  scheduledAt: Date | null;
};

const NOTIFICATIONS_AUTH_ERROR_MESSAGE = "Connexion requise pour gerer les notifications.";

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
  const fromTopLevel = readNumber(data.delivered_count, data.sent_count, data.success_count);
  if (fromTopLevel > 0) {
    return fromTopLevel;
  }

  if (data.notification_delivery_state && typeof data.notification_delivery_state === "object") {
    const state = data.notification_delivery_state as Record<string, unknown>;
    return readNumber(
      state.delivered_count as number | string | undefined,
      state.sent_count as number | string | undefined,
      state.success_count as number | string | undefined,
      state.total as number | string | undefined,
    );
  }

  return null;
}

function mapNotificationDocument(id: string, data: FirestorePushNotificationDocument): PushNotification {
  const createdAtValue = data.created_at?.toMillis() ?? 0;
  const scheduledTimeValue = data.scheduled_time?.toMillis() ?? createdAtValue;

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
    targetAudience: readText(data.target_audience, "All"),
    targetUserGroup: readText(data.target_user_group, "All"),
    userRefs: readText(data.user_refs),
    deliveryCount: extractDeliveryCount(data),
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
    },
  };
}

export async function searchNotificationUsers(search: string) {
  await ensureNotificationsAuthenticated();

  const normalized = search.trim().toLowerCase();
  if (normalized.length < 2) {
    return [] as NotificationRecipientUser[];
  }

  const snapshot = await getDocs(query(collection(db, "users"), limit(80)));

  return snapshot.docs
    .map((docSnapshot) => {
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
        createdAtValue: data.created_time?.toMillis() ?? data.created_at?.toMillis() ?? 0,
        lastActivityValue: data.last_real_activity_at?.toMillis() ?? 0,
        referralsCount: readNumber(
          data.referralCount,
          data.referrals_count,
          data.accepted_referrals_count,
        ),
      } satisfies NotificationRecipientUser;
    })
    .filter((user) => {
      const haystack = `${user.displayName} ${user.email}`.toLowerCase();
      return haystack.includes(normalized);
    })
    .slice(0, 5);
}

export async function createPushNotification(input: CreatePushNotificationInput) {
  const user = await ensureNotificationsAuthenticated();
  const title = input.title.trim();
  const message = input.message.trim();

  if (!title || !message) {
    throw new Error("Titre et message sont obligatoires.");
  }

  const notificationRef = await addDoc(collection(db, "ff_push_notifications"), {
    created_at: serverTimestamp(),
    created_by: doc(db, "users", user.uid),
    notification_title: title,
    notification_text: message,
    notification_image_url: input.imageUrl.trim(),
    notification_sound: "",
    initial_page_name: input.initialPageName.trim(),
    parameter_data: input.parameterData.trim(),
    scheduled_time: input.scheduledAt ? Timestamp.fromDate(input.scheduledAt) : serverTimestamp(),
    status: input.scheduledAt ? "scheduled" : "pending",
    target_audience: input.audienceMode === "segment" ? input.segmentId : "All",
    target_user_group: input.audienceMode === "segment" ? input.segmentId : "All",
    user_refs: input.audienceMode === "single" ? input.userUid.trim() : "",
  });

  return notificationRef.id;
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
        return "Impossible d acceder aux notifications avec cette session.";
      case "failed-precondition":
        return "La collection ff_push_notifications n est pas disponible avec cette configuration.";
      case "unavailable":
        return "Firestore est temporairement indisponible.";
      default:
        return error.message || "Une erreur Firebase a bloque l operation notifications.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Une erreur inattendue a bloque l operation notifications.";
}
