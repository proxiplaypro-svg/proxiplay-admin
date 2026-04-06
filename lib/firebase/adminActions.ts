"use client";

import { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db } from "./client-app";
import { functionsClient } from "./functions";
import type { AdminFollowUpChannel, AdminFollowUpStatus } from "./adminQueries";
import {
  duplicateGameDocument,
  type DuplicateGameResult,
} from "./gamesQueries";

export type RebuildAdminStatsResult = {
  success: boolean;
  error: string | null;
  source: "rebuild";
  requestedBy: string;
  timestamp: string;
  stats: {
    gamesCount: number;
    activeGamesCount: number;
    usersCount: number;
    playersCount: number;
    merchantsCount: number;
    participationsCount: number;
    winnersCount: number;
  };
};

export type SendMerchantEmailPayload = {
  email: string;
  subject: string;
  message: string;
};

export type SendMerchantEmailResult = {
  success: boolean;
  error: string | null;
  messageId: string;
};

export type SendMerchantNotificationPayload = {
  userId: string;
  title: string;
  body: string;
  createdByUid?: string | null;
};

export type SendMerchantNotificationResult = {
  success: boolean;
  error: string | null;
  notificationId: string;
};

export type ResyncMerchantCountersPayload = {
  merchantId: string;
};

export type ResyncMerchantCountersResult = {
  success: boolean;
  merchantId: string;
  stats: {
    gamesCount: number;
    participationsCount: number;
    winnersCount: number;
    lastActivityAt: string | null;
  };
};

export type AdminFollowUpUpdatePayload = {
  lastContactChannel: AdminFollowUpChannel;
  followUpStatus: AdminFollowUpStatus;
  followUpNote: string;
  lastContactAt: string | null;
};

export type UpdateMerchantFollowUpPayload = AdminFollowUpUpdatePayload & {
  merchantId: string;
};

export type UpdatePlayerFollowUpPayload = AdminFollowUpUpdatePayload & {
  userId: string;
};

export type MarkMerchantAsContactedPayload = {
  merchantId: string;
  lastContactChannel: AdminFollowUpChannel;
  followUpNote?: string;
};

export type MarkPlayerAsContactedPayload = {
  userId: string;
  lastContactChannel: AdminFollowUpChannel;
  followUpNote?: string;
};

export type MarkMerchantsAsContactedPayload = {
  merchantIds: string[];
  lastContactChannel: AdminFollowUpChannel;
  followUpNote?: string;
};

export type MarkPlayersAsContactedPayload = {
  userIds: string[];
  lastContactChannel: AdminFollowUpChannel;
  followUpNote?: string;
};

export type SendBulkReminderResult = {
  success: boolean;
  remindedCount: number;
  remindedMerchantIds: string[];
};

export type DuplicateGamePayload = {
  gameId: string;
  collectionName: "games" | "jeux";
  merchantCollectionName?: "enseignes" | "merchants";
};

export function getRebuildAdminStatsErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "functions/unauthenticated":
        return "Connexion requise pour lancer le rebuild des stats globales.";
      case "functions/permission-denied":
        return "Seuls les admins autorises peuvent lancer le rebuild des stats globales.";
      case "functions/unavailable":
      case "functions/not-found":
        return "La fonction de rebuild n est pas disponible ou pas encore deployee.";
      default:
        return "Le backend a retourne une erreur pendant le rebuild des stats globales.";
    }
  }

  return "Une erreur inattendue a empeche le rebuild des stats globales.";
}

export function getSendMerchantEmailErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "functions/unauthenticated":
        return "Connexion requise pour envoyer un email commercant.";
      case "functions/permission-denied":
        return "Seuls les admins autorises peuvent envoyer un email commercant.";
      case "functions/failed-precondition":
        return error.message || "Le serveur email n est pas entierement configure.";
      case "functions/invalid-argument":
        return "Sujet, email ou message invalide.";
      case "functions/unavailable":
      case "functions/not-found":
        return "La fonction d envoi email n est pas disponible.";
      default:
        return error.message || "Le backend a retourne une erreur pendant l envoi de l email.";
    }
  }

  return "Une erreur inattendue a empeche l envoi de l email.";
}

export function getSendMerchantNotificationErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "permission-denied":
        return "Les regles Firestore bloquent actuellement la creation de notifications admin.";
      case "unavailable":
        return "Firestore est temporairement indisponible pour creer la notification.";
      default:
        return error.message || "Une erreur backend a empeche la creation de la notification.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Une erreur inattendue a empeche la creation de la notification.";
}

export function getResyncMerchantCountersErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "functions/unauthenticated":
        return "Connexion requise pour resynchroniser une enseigne.";
      case "functions/permission-denied":
        return "Seuls les admins autorises peuvent resynchroniser une enseigne.";
      case "functions/not-found":
        return "Le commercant cible est introuvable dans Firestore.";
      case "functions/invalid-argument":
        return "Identifiant commercant invalide pour la resynchronisation.";
      case "functions/unavailable":
        return "La fonction de resynchronisation n est pas disponible.";
      default:
        return error.message || "Le backend a retourne une erreur pendant la resynchronisation.";
    }
  }

  return "Une erreur inattendue a empeche la resynchronisation.";
}

export function getAdminFollowUpErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "permission-denied":
        return "Acces admin requis pour mettre a jour le suivi de relance.";
      case "not-found":
        return "Le document cible est introuvable dans Firestore.";
      case "unavailable":
        return "Firestore est temporairement indisponible pour cette mise a jour.";
      default:
        return error.message || "La mise a jour du suivi de relance a echoue.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "La mise a jour du suivi de relance a echoue.";
}

function normalizeFollowUpNote(value: string | undefined) {
  return value?.trim() ?? "";
}

function parseLastContactAt(value: string | null) {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("La date de relance est invalide.");
  }

  return Timestamp.fromDate(parsedDate);
}

function buildFollowUpPatch(payload: AdminFollowUpUpdatePayload) {
  return {
    last_contact_at: parseLastContactAt(payload.lastContactAt),
    last_contact_channel: payload.lastContactChannel,
    follow_up_status: payload.followUpStatus,
    follow_up_note: normalizeFollowUpNote(payload.followUpNote),
  };
}

function buildMarkAsContactedPatch(
  lastContactChannel: AdminFollowUpChannel,
  followUpNote?: string,
) {
  return {
    last_contact_at: Timestamp.now(),
    last_contact_channel: lastContactChannel,
    follow_up_status: "relance" as const,
    follow_up_note: normalizeFollowUpNote(followUpNote),
  };
}

export async function rebuildAdminStatsAction() {
  const callable = httpsCallable<void, RebuildAdminStatsResult>(
    functionsClient,
    "rebuildAdminStatsCallable",
  );

  const result = await callable();
  return result.data;
}

export async function resyncMerchantCountersAction(payload: ResyncMerchantCountersPayload) {
  const callable = httpsCallable<ResyncMerchantCountersPayload, ResyncMerchantCountersResult>(
    functionsClient,
    "resyncMerchantCounters",
  );

  const result = await callable(payload);
  return result.data;
}

export async function sendMerchantEmailAction(payload: SendMerchantEmailPayload) {
  const callable = httpsCallable<SendMerchantEmailPayload, SendMerchantEmailResult>(
    functionsClient,
    "sendMerchantEmail",
  );

  const result = await callable(payload);
  return result.data;
}

export async function sendMerchantNotificationAction(
  payload: SendMerchantNotificationPayload,
): Promise<SendMerchantNotificationResult> {
  const userId = payload.userId.trim();
  const title = payload.title.trim();
  const body = payload.body.trim();

  if (!userId) {
    throw new Error("Aucun user commerçant rattaché n est disponible pour cette notification.");
  }

  if (!title || !body) {
    throw new Error("Titre et message sont requis pour envoyer une notification.");
  }

  const notificationRef = await addDoc(collection(db, "ff_push_notifications"), {
    notification_title: title,
    notification_text: body,
    notification_image_url: "",
    notification_sound: "",
    parameter_data: "",
    initial_page_name: "",
    target_audience: "All",
    target_user_group: "All",
    user_refs: `users/${userId}`,
    status: "started",
    created_at: Timestamp.now(),
    created_by: payload.createdByUid ? `users/${payload.createdByUid}` : "admin/web",
  });

  return {
    success: true,
    error: null,
    notificationId: notificationRef.id,
  };
}

export async function updateMerchantFollowUpAction(payload: UpdateMerchantFollowUpPayload) {
  await updateDoc(doc(db, "enseignes", payload.merchantId), buildFollowUpPatch(payload));
}

export async function updatePlayerFollowUpAction(payload: UpdatePlayerFollowUpPayload) {
  await updateDoc(doc(db, "users", payload.userId), buildFollowUpPatch(payload));
}

export async function markMerchantAsContactedAction(payload: MarkMerchantAsContactedPayload) {
  await updateDoc(
    doc(db, "enseignes", payload.merchantId),
    buildMarkAsContactedPatch(payload.lastContactChannel, payload.followUpNote),
  );
}

export async function markPlayerAsContactedAction(payload: MarkPlayerAsContactedPayload) {
  await updateDoc(
    doc(db, "users", payload.userId),
    buildMarkAsContactedPatch(payload.lastContactChannel, payload.followUpNote),
  );
}

export async function markMerchantsAsContactedAction(payload: MarkMerchantsAsContactedPayload) {
  const merchantIds = [...new Set(payload.merchantIds.map((merchantId) => merchantId.trim()).filter(Boolean))];

  await Promise.all(
    merchantIds.map((merchantId) =>
      updateDoc(
        doc(db, "enseignes", merchantId),
        buildMarkAsContactedPatch(payload.lastContactChannel, payload.followUpNote),
      ),
    ),
  );
}

export async function markPlayersAsContactedAction(payload: MarkPlayersAsContactedPayload) {
  const userIds = [...new Set(payload.userIds.map((userId) => userId.trim()).filter(Boolean))];

  await Promise.all(
    userIds.map((userId) =>
      updateDoc(
        doc(db, "users", userId),
        buildMarkAsContactedPatch(payload.lastContactChannel, payload.followUpNote),
      ),
    ),
  );
}

export async function sendBulkReminder(): Promise<SendBulkReminderResult> {
  const [merchantsSnapshot, gamesSnapshot] = await Promise.all([
    getDocs(collection(db, "enseignes")),
    getDocs(collection(db, "games")),
  ]);

  const now = Date.now();
  const activeMerchantIds = new Set<string>();

  gamesSnapshot.docs.forEach((gameDoc) => {
    const endDate = gameDoc.get("end_date");
    const startDate = gameDoc.get("start_date");
    const isVisible = gameDoc.get("visible_public");
    const merchantRef = gameDoc.get("enseigne_id");

    if (!merchantRef?.id || !(endDate instanceof Timestamp) || !(startDate instanceof Timestamp)) {
      return;
    }

    if (
      isVisible !== false &&
      startDate.toMillis() <= now &&
      endDate.toMillis() >= now
    ) {
      activeMerchantIds.add(merchantRef.id);
    }
  });

  const remindedMerchantIds = merchantsSnapshot.docs
    .map((merchantDoc) => merchantDoc.id)
    .filter((merchantId) => !activeMerchantIds.has(merchantId));

  await Promise.all(
    remindedMerchantIds.map((merchantId) =>
      updateDoc(
        doc(db, "enseignes", merchantId),
        buildMarkAsContactedPatch("manual", "Relance groupee depuis le dashboard"),
      ),
    ),
  );

  return {
    success: true,
    remindedCount: remindedMerchantIds.length,
    remindedMerchantIds,
  };
}

export async function duplicateGame(payload: DuplicateGamePayload): Promise<DuplicateGameResult> {
  return duplicateGameDocument(payload, payload.merchantCollectionName ?? "enseignes");
}
