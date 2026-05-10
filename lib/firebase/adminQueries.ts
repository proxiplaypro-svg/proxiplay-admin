"use client";

import {
  collection,
  doc,
  getDoc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "./client-app";

export type FirestoreSchemaDebugEntry = {
  collection: "games" | "prizes";
  id: string;
  keys: string[];
};

type FirestoreGameDocument = {
  name: string;
  description: string;
  prize_value: number;
  start_date: Timestamp;
  end_date: Timestamp;
  enseigne_id: DocumentReference;
  enseigne_name: string;
  game_type: string;
  hasMainPrize: boolean;
  hasWinner: boolean;
  main_prize_winner: DocumentReference | null;
  visible_public: boolean;
  views?: number;
  participations?: number;
  created_at?: Timestamp;
  created_time?: Timestamp;
  updated_at?: Timestamp;
  last_activity_at?: Timestamp;
};

type FirestoreEnseigneDocument = {
  name?: string;
  city?: string;
  email?: string;
  phone?: string;
  phone_number?: string;
  imageUrl?: string;
  logo?: string;
  owner?: string | DocumentReference | { id?: string; path?: string } | null;
  owner_id?: DocumentReference;
  games_count?: number;
  participations_count?: number;
  winners_count?: number;
  last_activity_at?: Timestamp;
  last_contact_at?: Timestamp | null;
  last_contact_channel?: string;
  follow_up_status?: string;
  follow_up_note?: string;
};

type FirestoreUserDocument = {
  pseudo?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  email?: string;
  phone_number?: string;
  phone?: string;
  city?: string;
  created_time?: Timestamp;
  user_role?: string;
  account_status?: string;
  remaining_part?: number | string;
  games_played_count?: number | string;
  part_last_update?: Timestamp;
  last_real_activity_at?: Timestamp;
  player_status_cached?: string;
  bonusMode?: string;
  bonusSource?: string;
  bonusExpiresAt?: Timestamp;
  allGamesAccessUntil?: Timestamp;
  last_contact_at?: Timestamp | null;
  last_contact_channel?: string;
  follow_up_status?: string;
  follow_up_note?: string;
};

type FirestoreParticipantDocument = {
  participation_date?: Timestamp;
  created_time?: Timestamp;
};

type FirestorePrizeDocument = {
  winner_id?: DocumentReference | null;
  game_id?: DocumentReference | null;
  created_at?: Timestamp;
  created_time?: Timestamp;
  updated_at?: Timestamp;
  win_date?: Timestamp;
  status?: string;
  claimed?: boolean;
  claimed_at?: Timestamp;
  redeemed_at?: Timestamp;
  label?: string;
  name?: string;
  title?: string;
  prize_label?: string;
  prize_name?: string;
  prize_title?: string;
  type?: string;
  prize_type?: string;
  value?: number | string;
  prize_value?: number | string;
};

type FirestoreReferralDocument = {
  campaignId?: string;
  inviterUid?: string;
  inviterPseudo?: string | null;
  inviteeUid?: string | null;
  inviteeContact?: string | null;
  inviteCode?: string;
  shareChannel?: string;
  status?: string;
  rewardStatus?: string;
  rewardType?: string;
  rewardValue?: number | string;
  createdAt?: Timestamp;
  acceptedAt?: Timestamp | null;
  rewardGrantedAt?: Timestamp | null;
  expiredAt?: Timestamp | null;
};

type FirestoreSharePromoStatsDocument = {
  pendingReferrals?: number | string;
  acceptedReferrals?: number | string;
  grantedRewards?: number | string;
  activeCampaigns?: number | string;
  updatedAt?: Timestamp;
};

export type AdminGameStatus = "actif" | "termine" | "a_venir";

export type AdminGameListItem = {
  id: string;
  name: string;
  enseigneName: string;
  status: AdminGameStatus;
  startDateLabel: string;
  endDateLabel: string;
  startDateValue: number;
  endDateValue: number;
  clicksCount: number;
  participationsCount: number;
  winnersCount: number;
};

export type AdminWinnerListItem = {
  id: string;
  winnerId: string | null;
  winnerLabel: string;
  winnerEmail: string;
  winnerPhone: string;
  gameId: string | null;
  gameName: string;
  merchantId: string | null;
  merchantName: string;
  prizeLabel: string;
  prizeTypeLabel: string;
  prizeValueLabel: string;
  wonAtLabel: string;
  wonAtValue: number;
  statusLabel: string;
  statusKey: string;
  canRelaunch: boolean;
};

export type AdminReferralBonusStatus = "actif" | "expire" | "aucun";

export type AdminReferralInviterListItem = {
  userId: string;
  label: string;
  email: string;
  latestInviteCode: string;
  inviteCodesCount: number;
  searchableInviteCodes: string;
  acceptedInviteesCount: number;
  pendingReferralsCount: number;
  grantedRewardsCount: number;
  lastAcceptedAtLabel: string;
  lastAcceptedAtValue: number;
  bonusStatus: AdminReferralBonusStatus;
  bonusStatusLabel: string;
  bonusExpiresAtLabel: string;
  bonusExpiresAtValue: number;
};

export type AdminReferralInviteeItem = {
  referralId: string;
  inviteeUserId: string | null;
  inviteCode: string;
  label: string;
  email: string;
  acceptedAtLabel: string;
  acceptedAtValue: number;
  signupAtLabel: string;
  signupAtValue: number;
  rewardStatus: string;
  rewardStatusLabel: string;
  rewardGrantedAtLabel: string;
  rewardGrantedAtValue: number;
};

export type AdminReferralOverview = {
  invitersCount: number;
  inviteesCount: number;
  grantedRewardsCount: number;
  activeBonusesCount: number;
  pendingReferralsCount: number;
  lastStatsUpdateLabel: string | null;
  inviters: AdminReferralInviterListItem[];
};

export type AdminReferralInviterDetails = {
  userId: string;
  label: string;
  email: string;
  phone: string;
  latestInviteCode: string;
  inviteCodes: string[];
  acceptedInviteesCount: number;
  pendingReferralsCount: number;
  grantedRewardsCount: number;
  bonusStatus: AdminReferralBonusStatus;
  bonusStatusLabel: string;
  bonusExpiresAtLabel: string;
  bonusExpiresAtValue: number;
  invitees: AdminReferralInviteeItem[];
};

export type AdminMerchantStatus = "actif" | "a_relancer" | "inactif";
export type AdminFollowUpChannel = "email" | "phone" | "manual" | "unknown";
export type AdminFollowUpStatus = "a_faire" | "relance" | "sans_reponse" | "ok";

export type AdminFollowUpSummary = {
  lastContactAtLabel: string;
  lastContactAtValue: number;
  lastContactChannel: AdminFollowUpChannel;
  followUpStatus: AdminFollowUpStatus;
  followUpNote: string;
  hasLastContact: boolean;
};

export type AdminMerchantListItem = {
  id: string;
  name: string;
  city: string;
  email: string;
  phone: string;
  ownerUserId: string | null;
  hasOwnerUserRef: boolean;
  gamesCreatedCount: number;
  clicksCount: number;
  participationsCount: number;
  followersCount: number;
  activeGamesCount: number;
  latestGameStartValue: number;
  followUp: AdminFollowUpSummary;
};

export type AdminMerchantTechnicalState =
  | "ok"
  | "a_resynchroniser"
  | "owner_manquant"
  | "user_introuvable";

export type AdminMerchantTechnicalListItem = {
  id: string;
  name: string;
  ownerSummary: string;
  ownerUserId: string | null;
  gamesRealCount: number;
  participantsRealCount: number;
  winnersRealCount: number;
  lastActivityRealLabel: string;
  lastActivityRealValue: number;
  technicalState: AdminMerchantTechnicalState;
  technicalNotes: string[];
};

export type AdminGameViewsDiagnosticItem = {
  id: string;
  name: string;
  enseigneName: string;
  status: AdminGameStatus;
  startDateLabel: string;
  startDateValue: number;
  endDateLabel: string;
  endDateValue: number;
  viewsCount: number;
  participationsRealCount: number;
  participationsStoredCount: number;
  gapCount: number;
  lastParticipationRealLabel: string;
  lastParticipationRealValue: number;
  createdAtLabel: string;
  createdAtValue: number;
  updatedAtLabel: string;
  updatedAtValue: number;
  technicalNotes: string[];
};

export type AdminMerchantGameItem = {
  id: string;
  name: string;
  startDateLabel: string;
  endDateLabel: string;
  status: AdminGameStatus;
  clicksCount: number;
  participationsCount: number;
};

export type AdminMerchantDetails = {
  id: string;
  name: string;
  city: string;
  email: string;
  phone: string;
  imageUrl: string | null;
  ownerUserId: string | null;
  ownerUserFullName: string;
  hasOwnerUserRef: boolean;
  createdAtLabel: string;
  clicksCount: number;
  gamesCount: number;
  participationsCount: number;
  followersCount: number;
  winnersCount: number;
  lastGameLabel: string;
  lastActivityLabel: string;
  lastActivityValue: number;
  status: AdminMerchantStatus;
  games: AdminMerchantGameItem[];
  followUp: AdminFollowUpSummary;
};

export type AdminPlayerListItem = {
  id: string;
  pseudo: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  createdAtLabel: string;
  createdAtValue: number;
  userRole: string;
  accountStatus: string;
  gamesPlayedCount: number | null;
  winsCount: number | null;
  pushStatus: "actif" | "inconnu" | "non_verifie";
  lastRealActivityLabel: string;
  lastRealActivityValue: number;
  remainingPart: number | null;
  partLastUpdateValue: number;
  assiduityLabel: "Tres actif" | "Actif" | "A relancer" | "Inactif" | "Jamais actif";
  playerStatusCached: string;
  activityState: "actif" | "inactif" | "jamais";
  followUp: AdminFollowUpSummary;
};

export type AdminPlayerDetails = {
  id: string;
  pseudo: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  userRole: string;
  accountStatus: string;
  gamesPlayedCount: number | null;
  winsCount: number | null;
  pushStatus: "actif" | "inconnu";
  assiduityLabel: "Tres actif" | "Actif" | "A relancer" | "Inactif" | "Jamais actif";
  activityState: "actif" | "inactif" | "jamais";
  lastRealActivityLabel: string;
  lastRealActivityValue: number;
  createdAtLabel: string;
  playerStatusCached: string;
  followUp: AdminFollowUpSummary;
};

type FirestoreDashboardStatsDocument = {
  games_count?: number;
  active_games_count?: number;
  users_count?: number;
  players_count?: number;
  merchants_count?: number;
  participations_count?: number;
  winners_count?: number;
  last_computation_at?: Timestamp;
  updated_by?: string;
};

export type AdminDashboardStats = {
  gamesCount: number;
  activeGamesCount: number;
  usersCount: number;
  playersCount: number;
  merchantsCount: number;
  participationsCount: number;
  winnersCount: number;
  lastComputationAtLabel: string | null;
  updatedBy: string | null;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function timestampToMillis(timestamp: Timestamp | null | undefined) {
  return timestamp ? timestamp.toMillis() : 0;
}

function formatTimestampLabel(timestamp: Timestamp | null | undefined) {
  return timestamp ? formatDateTime(timestamp.toDate()) : "Aucune activite reelle";
}

function readFollowUpChannel(value: string | undefined): AdminFollowUpChannel {
  switch (value) {
    case "email":
    case "phone":
    case "manual":
      return value;
    default:
      return "unknown";
  }
}

function readFollowUpStatus(value: string | undefined): AdminFollowUpStatus {
  switch (value) {
    case "relance":
    case "sans_reponse":
    case "ok":
      return value;
    default:
      return "a_faire";
  }
}

function readFollowUpNote(value: string | undefined) {
  return value?.trim() ?? "";
}

function readFollowUpSummary(document: {
  last_contact_at?: Timestamp | null;
  last_contact_channel?: string;
  follow_up_status?: string;
  follow_up_note?: string;
}): AdminFollowUpSummary {
  const lastContactAt = document.last_contact_at ?? null;

  return {
    lastContactAtLabel: lastContactAt ? formatDateTime(lastContactAt.toDate()) : "Jamais relance",
    lastContactAtValue: lastContactAt?.toMillis() ?? 0,
    lastContactChannel: readFollowUpChannel(document.last_contact_channel),
    followUpStatus: readFollowUpStatus(document.follow_up_status),
    followUpNote: readFollowUpNote(document.follow_up_note),
    hasLastContact: Boolean(lastContactAt),
  };
}

function getGameStatus(game: FirestoreGameDocument, now = new Date()): AdminGameStatus {
  const startDate = game.start_date.toDate();
  const endDate = game.end_date.toDate();

  if (endDate.getTime() < now.getTime()) {
    return "termine";
  }

  if (
    game.visible_public &&
    startDate.getTime() <= now.getTime() &&
    endDate.getTime() >= now.getTime()
  ) {
    return "actif";
  }

  return "a_venir";
}

function getMerchantStatus(lastActivityAt: Date | null, now = new Date()): AdminMerchantStatus {
  if (!lastActivityAt) {
    return "inactif";
  }

  const diffInDays = (now.getTime() - lastActivityAt.getTime()) / (1000 * 60 * 60 * 24);

  if (diffInDays < 7) {
    return "actif";
  }

  if (diffInDays <= 30) {
    return "a_relancer";
  }

  return "inactif";
}

function getMerchantCommercialStatus(
  participationsCount: number,
  followersCount: number,
  activeGamesCount: number,
  latestGameStartValue: number,
  now = Date.now(),
): AdminMerchantStatus {
  const recentGameWindowInMs = 7 * 24 * 60 * 60 * 1000;
  const hasRecentlyStartedGame =
    latestGameStartValue > 0 && now - latestGameStartValue <= recentGameWindowInMs;

  if (activeGamesCount > 0 || hasRecentlyStartedGame) {
    return "actif";
  }

  if (participationsCount < 10 || followersCount === 0) {
    return "a_relancer";
  }

  return "actif";
}

function extractUserIdFromOwner(owner?: FirestoreEnseigneDocument["owner"]) {
  if (!owner) {
    return null;
  }

  if (typeof owner === "string") {
    const match = owner.match(/(?:^|\/)users\/([^/]+)$/);
    return match?.[1] ?? null;
  }

  if ("id" in owner && typeof owner.id === "string" && owner.id.length > 0) {
    return owner.id;
  }

  if ("path" in owner && typeof owner.path === "string") {
    const match = owner.path.match(/(?:^|\/)users\/([^/]+)$/);
    return match?.[1] ?? null;
  }

  return null;
}

function readInt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    return Number.parseInt(value, 10) || 0;
  }

  return 0;
}

function readNullableInt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsedValue = Number.parseInt(value, 10);
    return Number.isNaN(parsedValue) ? null : parsedValue;
  }

  return null;
}

function readDisplayText(value: string | undefined | null, fallback: string) {
  const normalizedValue = value?.trim();
  return normalizedValue && normalizedValue.length > 0 ? normalizedValue : fallback;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function readOptionalTimestamp(...values: Array<Timestamp | null | undefined>) {
  return values.find((value) => Boolean(value?.toMillis)) ?? null;
}

function readOptionalText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalizedValue = value?.trim();

    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return null;
}

function readPrizeLabel(prize: FirestorePrizeDocument) {
  return (
    readOptionalText(
      prize.prize_label,
      prize.prize_name,
      prize.prize_title,
      prize.label,
      prize.name,
      prize.title,
    ) ?? "Lot non renseigne"
  );
}

function readPrizeTypeLabel(prize: FirestorePrizeDocument) {
  return readOptionalText(prize.prize_type, prize.type) ?? "Type inconnu";
}

function readPrizeValueLabel(prize: FirestorePrizeDocument, game: FirestoreGameDocument | null) {
  const rawValue = prize.prize_value ?? prize.value ?? game?.prize_value;
  const numericValue = typeof rawValue === "string" ? Number.parseFloat(rawValue) : rawValue;

  return typeof numericValue === "number" && Number.isFinite(numericValue)
    ? formatCurrency(numericValue)
    : "Valeur non renseignee";
}

function readPrizeStatus(prize: FirestorePrizeDocument) {
  const explicitStatus = readOptionalText(prize.status);
  const normalizedExplicitStatus = explicitStatus ? normalizeStatusValue(explicitStatus) : null;

  if (!prize.winner_id?.id) {
    return {
      statusLabel: "Non attribue",
      statusKey: "non_attribue",
    };
  }

  if (
    prize.claimed === true ||
    readOptionalTimestamp(prize.redeemed_at, prize.claimed_at) ||
    normalizedExplicitStatus === "retire" ||
    normalizedExplicitStatus === "retiree" ||
    normalizedExplicitStatus === "retire" ||
    normalizedExplicitStatus === "redeemed" ||
    normalizedExplicitStatus === "claimed" ||
    normalizedExplicitStatus === "remis"
  ) {
    return {
      statusLabel: "Retire",
      statusKey: "retire",
    };
  }

  if (
    normalizedExplicitStatus === "attribue" ||
    normalizedExplicitStatus === "attribuee" ||
    normalizedExplicitStatus === "assigned"
  ) {
    return {
      statusLabel: "Attribue",
      statusKey: "attribue",
    };
  }

  if (explicitStatus) {
    return {
      statusLabel: explicitStatus,
      statusKey: explicitStatus.toLowerCase().replace(/\s+/g, "_"),
    };
  }

  return {
    statusLabel: "A retirer",
    statusKey: "a_retirer",
  };
}

function getUserIdentityLabel(
  userId: string | null,
  user: FirestoreUserDocument | null,
  fallbackPseudo?: string | null,
) {
  if (user) {
    const fullName = [user.first_name?.trim(), user.last_name?.trim()]
      .filter((part): part is string => Boolean(part && part.length > 0))
      .join(" ");

    return readOptionalText(
      user.pseudo,
      fullName,
      user.display_name,
      user.email,
      fallbackPseudo,
      userId ? `User ${userId}` : undefined,
    ) ?? "Utilisateur inconnu";
  }

  return readOptionalText(fallbackPseudo, userId ? `User ${userId}` : undefined) ?? "Utilisateur inconnu";
}

function readReferralRewardStatusLabel(value: string | undefined | null) {
  switch (value) {
    case "available":
      return "Disponible";
    case "granted":
      return "Accorde";
    case "blocked":
      return "Bloque";
    case "not_earned":
      return "Non declenche";
    default:
      return "Inconnu";
  }
}

function readReferralBonusSummary(user: FirestoreUserDocument | null, now = Date.now()) {
  const bonusExpiresAt = readOptionalTimestamp(user?.bonusExpiresAt, user?.allGamesAccessUntil);
  const bonusSource = readOptionalText(user?.bonusSource);
  const isReferralBonus = bonusSource === "referral";
  const bonusExpiresAtValue = bonusExpiresAt?.toMillis() ?? 0;

  if (isReferralBonus && bonusExpiresAt && bonusExpiresAtValue > now) {
    return {
      status: "actif" as const,
      statusLabel: "Bonus actif",
      bonusExpiresAtLabel: formatDateTime(bonusExpiresAt.toDate()),
      bonusExpiresAtValue,
    };
  }

  if (isReferralBonus && bonusExpiresAt) {
    return {
      status: "expire" as const,
      statusLabel: "Bonus expire",
      bonusExpiresAtLabel: formatDateTime(bonusExpiresAt.toDate()),
      bonusExpiresAtValue,
    };
  }

  return {
    status: "aucun" as const,
    statusLabel: "Aucun bonus",
    bonusExpiresAtLabel: "Aucune expiration",
    bonusExpiresAtValue: 0,
  };
}

async function getUsersByIds(userIds: Iterable<string>) {
  const ids = [...new Set([...userIds].filter(Boolean))];
  const snapshots = await Promise.all(ids.map((userId) => getDoc(doc(db, "users", userId))));
  const usersById = new Map<string, FirestoreUserDocument>();

  snapshots.forEach((snapshot) => {
    if (snapshot.exists()) {
      usersById.set(snapshot.id, snapshot.data() as FirestoreUserDocument);
    }
  });

  return usersById;
}

function compareReferralTimestamps(left: Timestamp | null | undefined, right: Timestamp | null | undefined) {
  return (right?.toMillis() ?? 0) - (left?.toMillis() ?? 0);
}

function buildReferralInviterItem(
  userId: string,
  referrals: Array<{ id: string; data: FirestoreReferralDocument }>,
  user: FirestoreUserDocument | null,
  now = Date.now(),
): AdminReferralInviterListItem {
  const sortedReferrals = [...referrals].sort((left, right) =>
    compareReferralTimestamps(left.data.createdAt, right.data.createdAt),
  );
  const latestReferral = sortedReferrals[0]?.data ?? null;
  const acceptedReferrals = sortedReferrals.filter(
    (referral) => referral.data.status === "accepted" && referral.data.inviteeUid,
  );
  const lastAcceptedAt = acceptedReferrals
    .map((referral) => referral.data.acceptedAt ?? null)
    .sort(compareReferralTimestamps)[0] ?? null;
  const bonus = readReferralBonusSummary(user, now);

  return {
    userId,
    label: getUserIdentityLabel(userId, user, latestReferral?.inviterPseudo),
    email: readDisplayText(user?.email, "Non renseigne"),
    latestInviteCode: readDisplayText(latestReferral?.inviteCode, "Code introuvable"),
    inviteCodesCount: new Set(
      sortedReferrals
        .map((referral) => readOptionalText(referral.data.inviteCode))
        .filter((inviteCode): inviteCode is string => Boolean(inviteCode)),
    ).size,
    searchableInviteCodes: sortedReferrals
      .map((referral) => readOptionalText(referral.data.inviteCode))
      .filter((inviteCode): inviteCode is string => Boolean(inviteCode))
      .join(" "),
    acceptedInviteesCount: acceptedReferrals.length,
    pendingReferralsCount: sortedReferrals.filter((referral) => referral.data.status === "pending").length,
    grantedRewardsCount: sortedReferrals.filter((referral) => referral.data.rewardStatus === "granted").length,
    lastAcceptedAtLabel: lastAcceptedAt ? formatDateTime(lastAcceptedAt.toDate()) : "Aucune utilisation",
    lastAcceptedAtValue: lastAcceptedAt?.toMillis() ?? 0,
    bonusStatus: bonus.status,
    bonusStatusLabel: bonus.statusLabel,
    bonusExpiresAtLabel: bonus.bonusExpiresAtLabel,
    bonusExpiresAtValue: bonus.bonusExpiresAtValue,
  };
}

function getWinnerLabel(userId: string | null, user: FirestoreUserDocument | null) {
  if (!user) {
    return userId ? `User ${userId}` : "Gagnant inconnu";
  }

  const fullName = [user.first_name?.trim(), user.last_name?.trim()]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(" ");

  return readOptionalText(
    user.pseudo,
    user.display_name,
    fullName,
    user.email,
  ) ?? (userId ? `User ${userId}` : "Gagnant inconnu");
}

function normalizeStatusValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getPlayerAssiduity(
  lastRealActivityAt: Timestamp | null,
): Pick<AdminPlayerListItem, "assiduityLabel" | "activityState"> {
  if (!lastRealActivityAt) {
    return {
      assiduityLabel: "Jamais actif",
      activityState: "jamais",
    };
  }

  const diffInDays = (Date.now() - lastRealActivityAt.toMillis()) / (1000 * 60 * 60 * 24);

  if (diffInDays <= 3) {
    return {
      assiduityLabel: "Tres actif",
      activityState: "actif",
    };
  }

  if (diffInDays <= 14) {
    return {
      assiduityLabel: "Actif",
      activityState: "actif",
    };
  }

  if (diffInDays <= 45) {
    return {
      assiduityLabel: "A relancer",
      activityState: "inactif",
    };
  }

  return {
    assiduityLabel: "Inactif",
    activityState: "inactif",
  };
}

function readFollowersFromEnseigne(enseigne: FirestoreEnseigneDocument) {
  const rawValue =
    (enseigne as Record<string, unknown>).favoritesCount ??
    (enseigne as Record<string, unknown>).favorites ??
    (enseigne as Record<string, unknown>).favorisCount ??
    (enseigne as Record<string, unknown>).favoris ??
    (enseigne as Record<string, unknown>).stats_favorites ??
    (enseigne as Record<string, unknown>).stats_favoris;

  if (Array.isArray(rawValue)) {
    return rawValue.length;
  }

  return readInt(rawValue);
}

function getOwnerSummary(enseigne: FirestoreEnseigneDocument) {
  const items: string[] = [];

  if (enseigne.owner_id?.path) {
    items.push(`owner_id: ${enseigne.owner_id.path}`);
  }

  if (typeof enseigne.owner === "string" && enseigne.owner.length > 0) {
    items.push(`owner: ${enseigne.owner}`);
  } else if (
    enseigne.owner &&
    typeof enseigne.owner === "object" &&
    "path" in enseigne.owner &&
    typeof enseigne.owner.path === "string"
  ) {
    items.push(`owner: ${enseigne.owner.path}`);
  }

  return items.length > 0 ? items.join(" | ") : "Aucun owner stocke";
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export async function getDashboardStats(): Promise<AdminDashboardStats> {
  const statsRef = doc(db, "admin_stats", "global");
  const statsSnapshot = await getDoc(statsRef);

  if (!statsSnapshot.exists()) {
    return {
      gamesCount: 0,
      activeGamesCount: 0,
      usersCount: 0,
      playersCount: 0,
      merchantsCount: 0,
      participationsCount: 0,
      winnersCount: 0,
      lastComputationAtLabel: null,
      updatedBy: null,
    };
  }

  const stats = statsSnapshot.data() as FirestoreDashboardStatsDocument;
  const lastComputationAt = stats.last_computation_at?.toDate() ?? null;

  return {
    gamesCount: stats.games_count ?? 0,
    activeGamesCount: stats.active_games_count ?? 0,
    usersCount: stats.users_count ?? 0,
    playersCount: stats.players_count ?? 0,
    merchantsCount: stats.merchants_count ?? 0,
    participationsCount: stats.participations_count ?? 0,
    winnersCount: stats.winners_count ?? 0,
    lastComputationAtLabel: lastComputationAt ? formatDate(lastComputationAt) : null,
    updatedBy: stats.updated_by ?? null,
  };
}

export async function getGamesCount() {
  const snapshot = await getDocs(
    query(collection(db, "games"), orderBy("start_date", "desc")),
  );
  const now = new Date();

  return snapshot.docs.filter((doc) => {
    const game = doc.data() as FirestoreGameDocument;
    return getGameStatus(game, now) === "actif";
  }).length;
}

export async function getMerchantsCount() {
  const snapshot = await getCountFromServer(collection(db, "enseignes"));
  return snapshot.data().count;
}

export async function getMerchantsList() {
  const enseignesSnapshot = await getDocs(collection(db, "enseignes"));
  const merchantItems = await Promise.all(
    enseignesSnapshot.docs.map(async (merchantDoc) => {
      const enseigne = merchantDoc.data() as FirestoreEnseigneDocument;
      const ownerUserId = enseigne.owner_id?.id ?? extractUserIdFromOwner(enseigne.owner);
      const ownerUserRef = ownerUserId ? doc(db, "users", ownerUserId) : null;

      let clicksCount = 0;
      let participationsCount = 0;
      let followersCount = 0;
      let activeGamesCount = 0;
      let gamesCreatedCount = 0;
      let latestGameStartValue = 0;
      let ownerUserEmail = "";
      let ownerUserPhone = "";

      if (ownerUserRef) {
        const [gamesSnapshot, ownerEnseignesSnapshot, ownerUserSnapshot] = await Promise.all([
          getDocs(query(collection(db, "games"), where("create_by", "==", ownerUserRef))),
          getDocs(query(collection(db, "enseignes"), where("owner", "==", ownerUserRef))),
          getDoc(ownerUserRef),
        ]);

        if (ownerUserSnapshot.exists()) {
          const ownerUser = ownerUserSnapshot.data() as FirestoreUserDocument;
          ownerUserEmail = ownerUser.email?.trim() ?? "";
          ownerUserPhone = ownerUser.phone_number?.trim() || ownerUser.phone?.trim() || "";
        }

        gamesCreatedCount = gamesSnapshot.size;

        gamesSnapshot.docs.forEach((gameDoc) => {
          const game = gameDoc.data() as FirestoreGameDocument;
          clicksCount += readInt(game.views);
          participationsCount += readInt(game.participations);
          activeGamesCount += getGameStatus(game) === "actif" ? 1 : 0;
          latestGameStartValue = Math.max(
            latestGameStartValue,
            game.start_date?.toDate().getTime() ?? 0,
          );
        });

        ownerEnseignesSnapshot.docs.forEach((ownerEnseigneDoc) => {
          followersCount += readFollowersFromEnseigne(
            ownerEnseigneDoc.data() as FirestoreEnseigneDocument,
          );
        });
      }

      return {
        id: merchantDoc.id,
        name: enseigne.name ?? "Sans nom",
        city: enseigne.city ?? "",
        email: ownerUserEmail || (enseigne.email ?? ""),
        phone: ownerUserPhone || (enseigne.phone ?? enseigne.phone_number ?? ""),
        ownerUserId,
        hasOwnerUserRef: Boolean(ownerUserRef),
        gamesCreatedCount,
        clicksCount,
        participationsCount,
        followersCount,
        activeGamesCount,
        latestGameStartValue,
        followUp: readFollowUpSummary(enseigne),
      } satisfies AdminMerchantListItem;
    }),
  );

  return merchantItems.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function getMerchantsTechnicalList() {
  const enseignesSnapshot = await getDocs(collection(db, "enseignes"));

  const items = await Promise.all(
    enseignesSnapshot.docs.map(async (merchantDoc) => {
      const enseigne = merchantDoc.data() as FirestoreEnseigneDocument;
      const ownerUserId = enseigne.owner_id?.id ?? extractUserIdFromOwner(enseigne.owner);
      const ownerSummary = getOwnerSummary(enseigne);
      const technicalNotes: string[] = [];
      let technicalState: AdminMerchantTechnicalState = "ok";

      let ownerUserExists = false;
      if (!ownerUserId) {
        technicalState = "owner_manquant";
        technicalNotes.push("Aucun owner_id ou owner exploitable sur l enseigne.");
      } else {
        const ownerSnapshot = await getDoc(doc(db, "users", ownerUserId));
        ownerUserExists = ownerSnapshot.exists();

        if (!ownerUserExists) {
          technicalState = "user_introuvable";
          technicalNotes.push(`Le user users/${ownerUserId} est introuvable.`);
        }
      }

      const gamesSnapshot = await getDocs(
        query(collection(db, "games"), where("enseigne_id", "==", merchantDoc.ref)),
      );

      const gameRefs = gamesSnapshot.docs.map((gameDoc) => gameDoc.ref);
      let participantsRealCount = 0;
      let lastActivityReal: Timestamp | null = null;

      for (const gameDoc of gamesSnapshot.docs) {
        const participantsSnapshot = await getDocs(collection(gameDoc.ref, "participants"));
        participantsRealCount += participantsSnapshot.size;

        participantsSnapshot.docs.forEach((participantDoc) => {
          const participant = participantDoc.data() as FirestoreParticipantDocument;
          const activityTimestamp =
            participant.participation_date ?? participant.created_time ?? null;

          if (!activityTimestamp?.toMillis) {
            return;
          }

          if (!lastActivityReal || activityTimestamp.toMillis() > lastActivityReal.toMillis()) {
            lastActivityReal = activityTimestamp;
          }
        });
      }

      let winnersRealCount = 0;
      const gameRefChunks = chunkArray(gameRefs, 30);

      for (const gameRefChunk of gameRefChunks) {
        const prizesSnapshot = await getDocs(
          query(collection(db, "prizes"), where("game_id", "in", gameRefChunk)),
        );
        winnersRealCount += prizesSnapshot.size;
      }

      const storedGamesCount = enseigne.games_count ?? 0;
      const storedParticipationsCount = enseigne.participations_count ?? 0;
      const storedWinnersCount = enseigne.winners_count ?? 0;
      const storedLastActivity = enseigne.last_activity_at ?? null;

      if (storedGamesCount !== gamesSnapshot.size) {
        technicalNotes.push(
          `games_count stocke=${storedGamesCount}, reel=${gamesSnapshot.size}.`,
        );
      }

      if (storedParticipationsCount !== participantsRealCount) {
        technicalNotes.push(
          `participations_count stocke=${storedParticipationsCount}, reel=${participantsRealCount}.`,
        );
      }

      if (storedWinnersCount !== winnersRealCount) {
        technicalNotes.push(
          `winners_count stocke=${storedWinnersCount}, reel=${winnersRealCount}.`,
        );
      }

      const storedLastActivityMillis = timestampToMillis(storedLastActivity);
      const realLastActivityMillis = timestampToMillis(lastActivityReal);

      if (storedLastActivityMillis !== realLastActivityMillis) {
        technicalNotes.push("last_activity_at stocke differente de l activite reelle.");
      }

      if (
        technicalState === "ok" &&
        technicalNotes.length > 0
      ) {
        technicalState = "a_resynchroniser";
      }

      return {
        id: merchantDoc.id,
        name: enseigne.name ?? "Sans nom",
        ownerSummary,
        ownerUserId,
        gamesRealCount: gamesSnapshot.size,
        participantsRealCount,
        winnersRealCount,
        lastActivityRealLabel: formatTimestampLabel(lastActivityReal),
        lastActivityRealValue: timestampToMillis(lastActivityReal),
        technicalState,
        technicalNotes,
      } satisfies AdminMerchantTechnicalListItem;
    }),
  );

  return items.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function getPlayersList(): Promise<AdminPlayerListItem[]> {
  const [usersSnapshot, prizesSnapshot] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "prizes")),
  ]);

  const winsByUserId = new Map<string, number>();

  prizesSnapshot.docs.forEach((prizeDoc) => {
    const winnerRef = prizeDoc.get("winner_id");
    const winnerId = typeof winnerRef?.id === "string" ? winnerRef.id : null;

    if (!winnerId) {
      return;
    }

    winsByUserId.set(winnerId, (winsByUserId.get(winnerId) ?? 0) + 1);
  });

  const items: AdminPlayerListItem[] = [];

  for (const userDoc of usersSnapshot.docs) {
    const user = userDoc.data() as FirestoreUserDocument;
    const userRole = readDisplayText(user.user_role, "Non renseigne");

    if (user.user_role === "admin" || user.user_role === "commercant") {
      continue;
    }

    const createdAt = user.created_time ?? null;
    const lastRealActivityAt = user.last_real_activity_at ?? null;
    const assiduity = getPlayerAssiduity(lastRealActivityAt);
    const fullName = [user.first_name?.trim(), user.last_name?.trim()]
      .filter((part): part is string => Boolean(part && part.length > 0))
      .join(" ");

    items.push({
      id: userDoc.id,
      pseudo: readDisplayText(user.pseudo ?? user.display_name, "Non renseigne"),
      fullName: fullName.length > 0 ? fullName : "Non renseigne",
      email: readDisplayText(user.email, "Non renseigne"),
      phone: readDisplayText(user.phone_number, "Non renseigne"),
      city: readDisplayText(user.city, "Non renseignee"),
      createdAtLabel: createdAt ? formatDate(createdAt.toDate()) : "Non renseignee",
      createdAtValue: createdAt?.toMillis() ?? 0,
      userRole,
      accountStatus: readDisplayText(user.account_status, "Non renseigne"),
      gamesPlayedCount: readNullableInt(user.games_played_count),
      winsCount: winsByUserId.get(userDoc.id) ?? 0,
      pushStatus: "non_verifie",
      lastRealActivityLabel: lastRealActivityAt
        ? formatDateTime(lastRealActivityAt.toDate())
        : "Aucune activite",
      lastRealActivityValue: lastRealActivityAt?.toMillis() ?? 0,
      remainingPart: readNullableInt(user.remaining_part),
      partLastUpdateValue: user.part_last_update?.toMillis() ?? 0,
      assiduityLabel: assiduity.assiduityLabel,
      playerStatusCached: readDisplayText(
        user.player_status_cached,
        "Non renseigne",
      ),
      activityState: assiduity.activityState,
      followUp: readFollowUpSummary(user),
    });
  }

  return items.sort((a, b) => b.createdAtValue - a.createdAtValue);
}

export async function getPlayersPushStatuses(userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter((userId) => userId.trim().length > 0))];
  const pushStatuses = new Map<string, "actif" | "inconnu">();

  await Promise.all(
    uniqueUserIds.map(async (userId) => {
      const tokensSnapshot = await getDocs(
        query(collection(doc(db, "users", userId), "fcm_tokens"), limit(1)),
      );

      pushStatuses.set(userId, tokensSnapshot.empty ? "inconnu" : "actif");
    }),
  );

  return pushStatuses;
}

export async function getPlayerDetails(userId: string): Promise<AdminPlayerDetails | null> {
  const userRef = doc(db, "users", userId);
  const [userSnapshot, tokensSnapshot] = await Promise.all([
    getDoc(userRef),
    getDocs(query(collection(userRef, "fcm_tokens"), limit(1))),
  ]);

  if (!userSnapshot.exists()) {
    return null;
  }

  let winsCount = 0;
  try {
    const winsSnapshot = await getCountFromServer(
      query(collection(db, "prizes"), where("winner_id", "==", userRef)),
    );
    winsCount = winsSnapshot.data().count;
  } catch {
    winsCount = 0;
  }

  const user = userSnapshot.data() as FirestoreUserDocument;
  const createdAt = user.created_time ?? null;
  const lastRealActivityAt = user.last_real_activity_at ?? null;
  const assiduity = getPlayerAssiduity(lastRealActivityAt);
  const fullName = [user.first_name?.trim(), user.last_name?.trim()]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(" ");

  return {
    id: userSnapshot.id,
    pseudo: readDisplayText(user.pseudo ?? user.display_name, "Non renseigne"),
    fullName: fullName.length > 0 ? fullName : "Non renseigne",
    email: readDisplayText(user.email, "Non renseigne"),
    phone: readDisplayText(user.phone_number, "Non renseigne"),
    city: readDisplayText(user.city, "Non renseignee"),
    userRole: readDisplayText(user.user_role, "Non renseigne"),
    accountStatus: readDisplayText(user.account_status, "Non renseigne"),
    gamesPlayedCount: readNullableInt(user.games_played_count),
    winsCount,
    pushStatus: tokensSnapshot.empty ? "inconnu" : "actif",
    assiduityLabel: assiduity.assiduityLabel,
    activityState: assiduity.activityState,
    lastRealActivityLabel: lastRealActivityAt
      ? formatDateTime(lastRealActivityAt.toDate())
      : "Aucune activite",
    lastRealActivityValue: lastRealActivityAt?.toMillis() ?? 0,
    createdAtLabel: createdAt ? formatDate(createdAt.toDate()) : "Non renseignee",
    playerStatusCached: readDisplayText(user.player_status_cached, "Non renseigne"),
    followUp: readFollowUpSummary(user),
  };
}

export async function getMerchantDetails(merchantId: string) {
  const merchantRef = doc(db, "enseignes", merchantId);
  const merchantSnapshot = await getDoc(merchantRef);

  if (!merchantSnapshot.exists()) {
    return null;
  }

  const enseigne = merchantSnapshot.data() as FirestoreEnseigneDocument;
  const ownerUserId = enseigne.owner_id?.id ?? extractUserIdFromOwner(enseigne.owner);
  const ownerUserRef = ownerUserId ? doc(db, "users", ownerUserId) : null;

  const [gamesSnapshot, ownerEnseignesSnapshot, ownerUserSnapshot] = await Promise.all([
    getDocs(
      query(
        collection(db, "games"),
        where("enseigne_id", "==", merchantRef),
        orderBy("start_date", "desc"),
      ),
    ),
    ownerUserRef
      ? getDocs(query(collection(db, "enseignes"), where("owner", "==", ownerUserRef)))
      : Promise.resolve(null),
    ownerUserRef ? getDoc(ownerUserRef) : Promise.resolve(null),
  ]);

  let clicksCount = 0;
  let activeGamesCount = 0;
  let latestGameStartValue = 0;
  gamesSnapshot.docs.forEach((gameDoc) => {
    const game = gameDoc.data() as FirestoreGameDocument;
    clicksCount += readInt(game.views);
    activeGamesCount += getGameStatus(game) === "actif" ? 1 : 0;
    latestGameStartValue = Math.max(
      latestGameStartValue,
      game.start_date?.toDate().getTime() ?? 0,
    );
  });

  let followersCount = 0;
  ownerEnseignesSnapshot?.docs.forEach((ownerEnseigneDoc) => {
    followersCount += readFollowersFromEnseigne(
      ownerEnseigneDoc.data() as FirestoreEnseigneDocument,
    );
  });

  const ownerUserEmail = ownerUserSnapshot?.exists()
    ? ((ownerUserSnapshot.data() as FirestoreUserDocument).email?.trim() ?? "")
    : "";
  const ownerUserPhone = ownerUserSnapshot?.exists()
    ? (
        (ownerUserSnapshot.data() as FirestoreUserDocument).phone_number?.trim() ||
        (ownerUserSnapshot.data() as FirestoreUserDocument).phone?.trim() ||
        ""
      )
    : "";
  const ownerUserFullName = ownerUserSnapshot?.exists()
    ? [
        (ownerUserSnapshot.data() as FirestoreUserDocument).first_name?.trim() ?? "",
        (ownerUserSnapshot.data() as FirestoreUserDocument).last_name?.trim() ?? "",
      ]
        .filter((part) => part.length > 0)
        .join(" ")
    : "";

  const lastActivityAt = enseigne.last_activity_at?.toDate() ?? null;
  const now = new Date();

  const games = gamesSnapshot.docs.map((gameDoc) => {
    const game = gameDoc.data() as FirestoreGameDocument;

    return {
      id: gameDoc.id,
      name: game.name,
      startDateLabel: formatDate(game.start_date.toDate()),
      endDateLabel: formatDate(game.end_date.toDate()),
      status: getGameStatus(game, now),
      clicksCount: readInt(game.views),
      participationsCount: readInt(game.participations),
    };
  });

  const participationsCount = enseigne.participations_count ?? 0;

  return {
    id: merchantSnapshot.id,
    name: enseigne.name ?? "Sans nom",
    city: enseigne.city ?? "",
    email: ownerUserEmail || (enseigne.email ?? ""),
    phone: ownerUserPhone || (enseigne.phone ?? enseigne.phone_number ?? ""),
    imageUrl: enseigne.imageUrl ?? enseigne.logo ?? null,
    ownerUserId,
    ownerUserFullName: ownerUserFullName || "Non renseigne",
    hasOwnerUserRef: Boolean(ownerUserRef),
    createdAtLabel: "Non disponible",
    clicksCount,
    gamesCount: enseigne.games_count ?? gamesSnapshot.size,
    participationsCount,
    followersCount,
    winnersCount: enseigne.winners_count ?? 0,
    lastGameLabel: games[0]?.name ?? "Aucun jeu",
    lastActivityLabel: lastActivityAt ? formatDate(lastActivityAt) : "Aucune activite",
    lastActivityValue: lastActivityAt?.getTime() ?? 0,
    status: getMerchantCommercialStatus(
      participationsCount,
      followersCount,
      activeGamesCount,
      latestGameStartValue,
    ),
    games,
    followUp: readFollowUpSummary(enseigne),
  } satisfies AdminMerchantDetails;
}

export async function getGamesList() {
  const [gamesSnapshot, prizesSnapshot] = await Promise.all([
    getDocs(query(collection(db, "games"), orderBy("start_date", "desc"))),
    getDocs(collection(db, "prizes")),
  ]);

  const validGameIds = new Set(gamesSnapshot.docs.map((doc) => doc.id));
  const participantsCountByGameId = new Map();

  const participantSnapshots = await Promise.all(
    gamesSnapshot.docs.map((doc) =>
      getCountFromServer(collection(doc.ref, "participants")),
    ),
  );

  gamesSnapshot.docs.forEach((doc, index) => {
    participantsCountByGameId.set(doc.id, participantSnapshots[index].data().count);
  });

  const winnersByGameId = new Map<string, number>();
  prizesSnapshot.docs.forEach((doc) => {
    const prizeGameRef = doc.get("game_id");
    const gameId = prizeGameRef?.id;
    if (!gameId || !validGameIds.has(gameId)) {
      return;
    }

    winnersByGameId.set(gameId, (winnersByGameId.get(gameId) ?? 0) + 1);
  });

  const now = new Date();

  return gamesSnapshot.docs.map((doc) => {
    const game = doc.data() as FirestoreGameDocument;
    const startDate = game.start_date.toDate();
    const endDate = game.end_date.toDate();

    return {
      id: doc.id,
      name: game.name,
      enseigneName: game.enseigne_name,
      status: getGameStatus(game, now),
      startDateLabel: formatDate(startDate),
      endDateLabel: formatDate(endDate),
      startDateValue: startDate.getTime(),
      endDateValue: endDate.getTime(),
      clicksCount: readInt(game.views),
      participationsCount: participantsCountByGameId.get(doc.id) ?? 0,
      winnersCount: winnersByGameId.get(doc.id) ?? 0,
    };
  });
}

export async function getGameViewsDiagnostics(): Promise<AdminGameViewsDiagnosticItem[]> {
  const gamesSnapshot = await getDocs(query(collection(db, "games"), orderBy("start_date", "desc")));
  const now = new Date();

  const items = await Promise.all(
    gamesSnapshot.docs.map(async (gameDoc) => {
      const game = gameDoc.data() as FirestoreGameDocument;
      const participantsSnapshot = await getDocs(collection(gameDoc.ref, "participants"));

      let lastParticipationReal: Timestamp | null = null;

      participantsSnapshot.docs.forEach((participantDoc) => {
        const participant = participantDoc.data() as FirestoreParticipantDocument;
        const activityTimestamp = participant.participation_date ?? participant.created_time ?? null;

        if (!activityTimestamp?.toMillis) {
          return;
        }

        if (!lastParticipationReal || activityTimestamp.toMillis() > lastParticipationReal.toMillis()) {
          lastParticipationReal = activityTimestamp;
        }
      });

      const viewsCount = readInt(game.views);
      const participationsStoredCount = readInt(game.participations);
      const participationsRealCount = participantsSnapshot.size;
      const gapCount = participationsRealCount - viewsCount;
      const technicalNotes: string[] = [];

      if (participationsStoredCount !== participationsRealCount) {
        technicalNotes.push(
          `participations stocke=${participationsStoredCount}, reel=${participationsRealCount}.`,
        );
      }

      if (gapCount > 0) {
        technicalNotes.push(`views inferieures aux participations reelles (ecart=${gapCount}).`);
      }

      const createdAt = game.created_at ?? game.created_time ?? null;
      const updatedAt = game.last_activity_at ?? game.updated_at ?? null;
      const startDate = game.start_date.toDate();
      const endDate = game.end_date.toDate();

      return {
        id: gameDoc.id,
        name: game.name,
        enseigneName: game.enseigne_name,
        status: getGameStatus(game, now),
        startDateLabel: formatDate(startDate),
        startDateValue: startDate.getTime(),
        endDateLabel: formatDate(endDate),
        endDateValue: endDate.getTime(),
        viewsCount,
        participationsRealCount,
        participationsStoredCount,
        gapCount,
        lastParticipationRealLabel: formatTimestampLabel(lastParticipationReal),
        lastParticipationRealValue: timestampToMillis(lastParticipationReal),
        createdAtLabel: createdAt ? formatTimestampLabel(createdAt) : "Inconnue",
        createdAtValue: timestampToMillis(createdAt),
        updatedAtLabel: updatedAt ? formatTimestampLabel(updatedAt) : "Inconnue",
        updatedAtValue: timestampToMillis(updatedAt),
        technicalNotes,
      } satisfies AdminGameViewsDiagnosticItem;
    }),
  );

  return items.sort((left, right) => {
    if ((right.gapCount > 0 ? 1 : 0) !== (left.gapCount > 0 ? 1 : 0)) {
      return (right.gapCount > 0 ? 1 : 0) - (left.gapCount > 0 ? 1 : 0);
    }

    if (right.gapCount !== left.gapCount) {
      return right.gapCount - left.gapCount;
    }

    return right.lastParticipationRealValue - left.lastParticipationRealValue;
  });
}

export async function getWinnersList(): Promise<AdminWinnerListItem[]> {
  const prizesSnapshot = await getDocs(collection(db, "prizes"));

  const winnerIds = [...new Set(
    prizesSnapshot.docs
      .map((prizeDoc) => {
        const winnerRef = prizeDoc.get("winner_id");
        return typeof winnerRef?.id === "string" ? winnerRef.id : null;
      })
      .filter((winnerId): winnerId is string => Boolean(winnerId)),
  )];

  const gameIds = [...new Set(
    prizesSnapshot.docs
      .map((prizeDoc) => {
        const gameRef = prizeDoc.get("game_id");
        return typeof gameRef?.id === "string" ? gameRef.id : null;
      })
      .filter((gameId): gameId is string => Boolean(gameId)),
  )];

  const [userSnapshots, gameSnapshots] = await Promise.all([
    Promise.all(winnerIds.map((winnerId) => getDoc(doc(db, "users", winnerId)))),
    Promise.all(gameIds.map((gameId) => getDoc(doc(db, "games", gameId)))),
  ]);

  const usersById = new Map<string, FirestoreUserDocument>();
  const gamesById = new Map<string, FirestoreGameDocument>();
  const merchantIds = new Set<string>();

  userSnapshots.forEach((userSnapshot) => {
    if (userSnapshot.exists()) {
      usersById.set(userSnapshot.id, userSnapshot.data() as FirestoreUserDocument);
    }
  });

  gameSnapshots.forEach((gameSnapshot) => {
    if (gameSnapshot.exists()) {
      const game = gameSnapshot.data() as FirestoreGameDocument;
      gamesById.set(gameSnapshot.id, game);

      if (game.enseigne_id?.id) {
        merchantIds.add(game.enseigne_id.id);
      }
    }
  });

  const merchantSnapshots = await Promise.all(
    [...merchantIds].map((merchantId) => getDoc(doc(db, "enseignes", merchantId))),
  );
  const merchantsById = new Map<string, FirestoreEnseigneDocument>();

  merchantSnapshots.forEach((merchantSnapshot) => {
    if (merchantSnapshot.exists()) {
      merchantsById.set(merchantSnapshot.id, merchantSnapshot.data() as FirestoreEnseigneDocument);
    }
  });

  const items = prizesSnapshot.docs.map((prizeDoc) => {
    const prize = prizeDoc.data() as FirestorePrizeDocument;
    const winnerRef = prize.winner_id ?? null;
    const gameRef = prize.game_id ?? null;
    const winnerId = winnerRef?.id ?? null;
    const gameId = gameRef?.id ?? null;
    const winner = winnerId ? (usersById.get(winnerId) ?? null) : null;
    const game = gameId ? (gamesById.get(gameId) ?? null) : null;
    const merchantId = game?.enseigne_id?.id ?? null;
    const merchant = merchantId ? (merchantsById.get(merchantId) ?? null) : null;
    const wonAt = readOptionalTimestamp(
      prize.win_date,
      prize.created_at,
      prize.created_time,
      prize.updated_at,
    );
    const status = readPrizeStatus(prize);

    return {
      id: prizeDoc.id,
      winnerId,
      winnerLabel: getWinnerLabel(winnerId, winner),
      winnerEmail: readDisplayText(winner?.email, "Non renseigne"),
      winnerPhone: readDisplayText(winner?.phone_number ?? winner?.phone, "Non renseigne"),
      gameId,
      gameName: readDisplayText(game?.name, "Jeu introuvable"),
      merchantId,
      merchantName: readDisplayText(game?.enseigne_name ?? merchant?.name, "Enseigne inconnue"),
      prizeLabel: readPrizeLabel(prize),
      prizeTypeLabel: readPrizeTypeLabel(prize),
      prizeValueLabel: readPrizeValueLabel(prize, game),
      wonAtLabel: wonAt ? formatDateTime(wonAt.toDate()) : "Date non renseignee",
      wonAtValue: wonAt?.toMillis() ?? 0,
      statusLabel: status.statusLabel,
      statusKey: status.statusKey,
      canRelaunch: winnerId !== null && status.statusKey !== "non_attribue" && status.statusKey !== "retire",
    } satisfies AdminWinnerListItem;
  });

  return items.sort((a, b) => b.wonAtValue - a.wonAtValue);
}

export async function getReferralOverview(): Promise<AdminReferralOverview> {
  const [referralsSnapshot, statsSnapshot] = await Promise.all([
    getDocs(collection(db, "referrals")),
    getDoc(doc(db, "admin_stats", "share_promo")),
  ]);

  const referrals = referralsSnapshot.docs.map((snapshot) => ({
    id: snapshot.id,
    data: snapshot.data() as FirestoreReferralDocument,
  }));
  const inviterIds = new Set(
    referrals
      .map((referral) => readOptionalText(referral.data.inviterUid))
      .filter((userId): userId is string => Boolean(userId)),
  );
  const inviteeIds = new Set(
    referrals
      .map((referral) => readOptionalText(referral.data.inviteeUid))
      .filter((userId): userId is string => Boolean(userId)),
  );
  const usersById = await getUsersByIds(new Set([...inviterIds, ...inviteeIds]));
  const stats = statsSnapshot.exists()
    ? (statsSnapshot.data() as FirestoreSharePromoStatsDocument)
    : null;
  const now = Date.now();
  const inviterBuckets = new Map<string, Array<{ id: string; data: FirestoreReferralDocument }>>();

  referrals.forEach((referral) => {
    const inviterUid = readOptionalText(referral.data.inviterUid);

    if (!inviterUid) {
      return;
    }

    const current = inviterBuckets.get(inviterUid) ?? [];
    current.push(referral);
    inviterBuckets.set(inviterUid, current);
  });

  const inviters = [...inviterBuckets.entries()]
    .map(([userId, userReferrals]) =>
      buildReferralInviterItem(userId, userReferrals, usersById.get(userId) ?? null, now),
    )
    .sort((left, right) => {
      if (right.acceptedInviteesCount !== left.acceptedInviteesCount) {
        return right.acceptedInviteesCount - left.acceptedInviteesCount;
      }

      if (right.lastAcceptedAtValue !== left.lastAcceptedAtValue) {
        return right.lastAcceptedAtValue - left.lastAcceptedAtValue;
      }

      return left.label.localeCompare(right.label, "fr");
    });

  const acceptedCount = referrals.filter(
    (referral) => referral.data.status === "accepted" && Boolean(referral.data.inviteeUid),
  ).length;
  const grantedCount = referrals.filter((referral) => referral.data.rewardStatus === "granted").length;
  const pendingCount = referrals.filter((referral) => referral.data.status === "pending").length;

  return {
    invitersCount: inviters.length,
    inviteesCount: acceptedCount,
    grantedRewardsCount:
      Number.parseInt(String(stats?.grantedRewards ?? grantedCount), 10) || grantedCount,
    activeBonusesCount: inviters.filter((inviter) => inviter.bonusStatus === "actif").length,
    pendingReferralsCount:
      Number.parseInt(String(stats?.pendingReferrals ?? pendingCount), 10) || pendingCount,
    lastStatsUpdateLabel: stats?.updatedAt ? formatDateTime(stats.updatedAt.toDate()) : null,
    inviters,
  };
}

export async function getReferralInviterDetails(
  userId: string,
): Promise<AdminReferralInviterDetails | null> {
  const referralsSnapshot = await getDocs(collection(db, "referrals"));
  const inviterReferrals = referralsSnapshot.docs
    .map((snapshot) => ({
      id: snapshot.id,
      data: snapshot.data() as FirestoreReferralDocument,
    }))
    .filter((referral) => referral.data.inviterUid === userId);

  if (inviterReferrals.length === 0) {
    return null;
  }

  const inviteeIds = inviterReferrals
    .map((referral) => readOptionalText(referral.data.inviteeUid))
    .filter((inviteeId): inviteeId is string => Boolean(inviteeId));
  const usersById = await getUsersByIds(new Set([userId, ...inviteeIds]));
  const inviter = usersById.get(userId) ?? null;
  const inviterListItem = buildReferralInviterItem(userId, inviterReferrals, inviter);

  const invitees = inviterReferrals
    .filter((referral) => referral.data.status === "accepted" && referral.data.inviteeUid)
    .map((referral) => {
      const inviteeUserId = readOptionalText(referral.data.inviteeUid);
      const invitee = inviteeUserId ? (usersById.get(inviteeUserId) ?? null) : null;
      const acceptedAt = referral.data.acceptedAt ?? null;
      const signupAt = invitee?.created_time ?? null;
      const rewardGrantedAt = referral.data.rewardGrantedAt ?? null;
      const rewardStatus = readOptionalText(referral.data.rewardStatus) ?? "unknown";

      return {
        referralId: referral.id,
        inviteeUserId,
        inviteCode: readDisplayText(referral.data.inviteCode, "Code introuvable"),
        label: getUserIdentityLabel(inviteeUserId, invitee),
        email: readDisplayText(invitee?.email, "Non renseigne"),
        acceptedAtLabel: acceptedAt ? formatDateTime(acceptedAt.toDate()) : "Non renseignee",
        acceptedAtValue: acceptedAt?.toMillis() ?? 0,
        signupAtLabel: signupAt ? formatDateTime(signupAt.toDate()) : "Non renseignee",
        signupAtValue: signupAt?.toMillis() ?? 0,
        rewardStatus,
        rewardStatusLabel: readReferralRewardStatusLabel(rewardStatus),
        rewardGrantedAtLabel: rewardGrantedAt ? formatDateTime(rewardGrantedAt.toDate()) : "Non declenche",
        rewardGrantedAtValue: rewardGrantedAt?.toMillis() ?? 0,
      } satisfies AdminReferralInviteeItem;
    })
    .sort((left, right) => {
      if (right.acceptedAtValue !== left.acceptedAtValue) {
        return right.acceptedAtValue - left.acceptedAtValue;
      }

      return left.label.localeCompare(right.label, "fr");
    });

  return {
    userId,
    label: getUserIdentityLabel(userId, inviter, inviterReferrals[0]?.data.inviterPseudo),
    email: readDisplayText(inviter?.email, "Non renseigne"),
    phone: readDisplayText(inviter?.phone_number ?? inviter?.phone, "Non renseigne"),
    latestInviteCode: inviterListItem.latestInviteCode,
    inviteCodes: [
      ...new Set(
        inviterReferrals
          .map((referral) => readOptionalText(referral.data.inviteCode))
          .filter((inviteCode): inviteCode is string => Boolean(inviteCode)),
      ),
    ],
    acceptedInviteesCount: inviterListItem.acceptedInviteesCount,
    pendingReferralsCount: inviterListItem.pendingReferralsCount,
    grantedRewardsCount: inviterListItem.grantedRewardsCount,
    bonusStatus: inviterListItem.bonusStatus,
    bonusStatusLabel: inviterListItem.bonusStatusLabel,
    bonusExpiresAtLabel: inviterListItem.bonusExpiresAtLabel,
    bonusExpiresAtValue: inviterListItem.bonusExpiresAtValue,
    invitees,
  };
}

export async function getUsersCount() {
  const snapshot = await getCountFromServer(collection(db, "users"));
  return snapshot.data().count;
}

export async function getParticipationsCount() {
  const gamesSnapshot = await getDocs(collection(db, "games"));
  const countSnapshots = await Promise.all(
    gamesSnapshot.docs.map((doc) =>
      getCountFromServer(collection(doc.ref, "participants")),
    ),
  );

  return countSnapshots.reduce((total, snapshot) => total + snapshot.data().count, 0);
}

export async function getWinnersCount() {
  const snapshot = await getCountFromServer(collection(db, "prizes"));
  return snapshot.data().count;
}

export async function debugGamesAndPrizesSchema() {
  const [gamesSnapshot, prizesSnapshot] = await Promise.all([
    getDocs(query(collection(db, "games"), limit(5))),
    getDocs(query(collection(db, "prizes"), limit(5))),
  ]);

  const entries: FirestoreSchemaDebugEntry[] = [
    ...gamesSnapshot.docs.map((doc) => ({
      collection: "games" as const,
      id: doc.id,
      keys: Object.keys(doc.data()).sort(),
    })),
    ...prizesSnapshot.docs.map((doc) => ({
      collection: "prizes" as const,
      id: doc.id,
      keys: Object.keys(doc.data()).sort(),
    })),
  ];

  console.group("Firestore schema debug");
  entries.forEach((entry) => {
    console.log(`[${entry.collection}] ${entry.id}`, entry.keys);
  });
  console.groupEnd();

  return entries;
}
