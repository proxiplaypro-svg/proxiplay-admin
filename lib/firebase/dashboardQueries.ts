import {
  collection,
  collectionGroup,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client-app";
import type {
  ActiveGameRow,
  ActivePlayerExportRow,
  DashboardAlert,
  DashboardData,
  DashboardGameBadge,
  DashboardKpi,
  MerchantDashboardStatus,
  MerchantTableRow,
  NotificationItem,
  NotificationSegment,
  OperationsAlertItem,
} from "@/types/dashboard";

type FirestoreUserDocument = {
  pseudo?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  isActive?: boolean;
  is_active?: boolean;
  account_status?: string;
  player_status_cached?: string;
  platform?: string;
  os?: string;
  device_platform?: string;
  sessionCount?: number | string;
  session_count?: number | string;
  games_played_count?: number | string;
  created_time?: Timestamp;
  created_at?: Timestamp;
  referralCount?: number | string;
  referrals_count?: number | string;
  accepted_referrals_count?: number | string;
};

type FirestoreMerchantDocument = {
  name?: string;
  status?: string;
  commercial_status?: string;
  created_at?: Timestamp;
  created_time?: Timestamp;
};

type FirestoreGameDocument = {
  name?: string;
  title?: string;
  enseigne_name?: string;
  merchantName?: string;
  enseigne_id?: { id?: string } | null;
  merchantId?: string;
  game_type?: string;
  status?: string;
  visible_public?: boolean;
  private?: boolean;
  imageUrl?: string | null;
  image_url?: string | null;
  start_date?: Timestamp;
  end_date?: Timestamp;
  expiresAt?: Timestamp;
  created_at?: Timestamp;
  created_time?: Timestamp;
};

type FirestoreAnalyticsDailyDocument = {
  dau?: number | string;
  mau?: number | string;
  active_users?: number | string;
  monthly_active_users?: number | string;
  date?: Timestamp;
  day?: Timestamp;
};

type FirestorePushNotificationDocument = {
  title?: string;
  notification_title?: string;
  sentAt?: Timestamp;
  sent_at?: Timestamp;
  created_at?: Timestamp;
  recipients?: number | string;
  recipientsCount?: number | string;
  openRate?: number | string;
  open_rate?: number | string;
  target_user_group?: string;
  segment?: string;
};

type FirestoreParticipantDocument = {
  participation_date?: Timestamp;
  created_time?: Timestamp;
};

type RawSnapshots = {
  users: Array<QueryDocumentSnapshot<DocumentData>>;
  merchantsPrimary: Array<QueryDocumentSnapshot<DocumentData>>;
  merchantsFallback: Array<QueryDocumentSnapshot<DocumentData>>;
  games: Array<QueryDocumentSnapshot<DocumentData>>;
  participants: Array<QueryDocumentSnapshot<DocumentData>>;
  analytics: Array<QueryDocumentSnapshot<DocumentData>>;
  notificationsPrimary: Array<QueryDocumentSnapshot<DocumentData>>;
  notificationsFallback: Array<QueryDocumentSnapshot<DocumentData>>;
  gameSessions: Array<QueryDocumentSnapshot<DocumentData>>;
};

const MILLIS_IN_DAY = 24 * 60 * 60 * 1000;

// TODO: creer collection analytics_daily avec champs { date: Timestamp, dau: number, mau: number }.
const MOCK_DAU_MAU_PERCENT = 34;

// TODO: creer collection push_notifications avec champs { title: string, sentAt: Timestamp, recipients: number, openRate: number, segment: string }.
const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "mock-weekend-friterie",
    title: "Weekend Friterie - jeu special",
    sentAtLabel: "Hier 18h - 596 destinataires",
    recipientsLabel: "596 destinataires",
    openRate: 68,
    progressTone: "green",
    segment: "Joueurs actifs",
  },
  {
    id: "mock-kursaal",
    title: "Nouveau jeu Kursaal - profitez-en !",
    sentAtLabel: "Mardi - 590 destinataires",
    recipientsLabel: "590 destinataires",
    openRate: 52,
    progressTone: "amber",
    segment: "iOS inactifs J7",
  },
  {
    id: "mock-gains",
    title: "Rappel - gains non reclames",
    sentAtLabel: "Lundi - 48 joueurs cibles",
    recipientsLabel: "48 joueurs cibles",
    openRate: 41,
    progressTone: "amber",
    segment: "Ambassadeurs",
  },
];

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function capitalize(value: string) {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

function asTimestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function readTimestamp(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const timestamp = asTimestamp(source[key]);
    if (timestamp) {
      return timestamp;
    }
  }

  return null;
}

function readString(source: Record<string, unknown>, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return fallback;
}

function readNumber(source: Record<string, unknown>, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function readBoolean(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function readDate(source: Record<string, unknown>, keys: string[]) {
  return readTimestamp(source, keys)?.toDate() ?? null;
}

function normalizeStatus(value: string) {
  return value.trim().toLowerCase();
}

function getUserDisplayName(id: string, user: FirestoreUserDocument) {
  const explicit = readString(user, ["display_name", "pseudo"]);
  if (explicit) {
    return explicit;
  }

  const fullName = [readString(user, ["first_name"]), readString(user, ["last_name"])]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || readString(user, ["email"], `Joueur ${id}`);
}

function getUserPlatform(user: FirestoreUserDocument) {
  return readString(user, ["platform", "device_platform", "os"], "inconnu").toLowerCase();
}

function getUserSessionCount(user: FirestoreUserDocument) {
  return Math.max(
    0,
    Math.trunc(readNumber(user, ["sessionCount", "session_count", "games_played_count"])),
  );
}

function isUserActive(user: FirestoreUserDocument) {
  const explicit = readBoolean(user, ["isActive", "is_active"]);
  if (explicit !== null) {
    return explicit;
  }

  const accountStatus = normalizeStatus(readString(user, ["account_status"]));
  const cachedStatus = normalizeStatus(readString(user, ["player_status_cached"]));
  return accountStatus === "active" || cachedStatus === "actif";
}

function isMerchantActive(merchant: FirestoreMerchantDocument, activeGamesCount: number) {
  const status = normalizeStatus(readString(merchant, ["status", "commercial_status"]));
  return status === "active" || status === "actif" || activeGamesCount > 0;
}

function getMerchantId(id: string, game: FirestoreGameDocument) {
  return game.enseigne_id?.id ?? readString(game, ["merchantId"], id);
}

function getGameName(game: FirestoreGameDocument, id: string) {
  return readString(game, ["name", "title"], `Jeu ${id}`);
}

function getMerchantName(game: FirestoreGameDocument) {
  return readString(game, ["enseigne_name", "merchantName"], "Marchand inconnu");
}

function getGameStartDate(game: FirestoreGameDocument) {
  return readDate(game, ["start_date", "created_at", "created_time"]);
}

function getGameEndDate(game: FirestoreGameDocument) {
  return readDate(game, ["expiresAt", "end_date"]);
}

function getGameImageUrl(game: FirestoreGameDocument) {
  return readString(game, ["imageUrl", "image_url"]);
}

function isGameDraft(game: FirestoreGameDocument) {
  const status = normalizeStatus(readString(game, ["status"]));
  const visible = readBoolean(game, ["visible_public"]);
  return status === "draft" || status === "brouillon" || visible === false;
}

function isGamePrivate(game: FirestoreGameDocument) {
  const isPrivateFlag = readBoolean(game, ["private"]);
  if (isPrivateFlag === true) {
    return true;
  }

  return readBoolean(game, ["visible_public"]) === false && !isGameDraft(game);
}

function getGameEmoji(game: FirestoreGameDocument, status: DashboardGameBadge) {
  if (status === "prive") {
    return "🔒";
  }

  const type = normalizeStatus(readString(game, ["game_type", "name"]));
  if (type.includes("promo")) {
    return "⚡";
  }
  if (type.includes("code")) {
    return "🎁";
  }
  if (type.includes("apero")) {
    return "🍹";
  }

  return "🎯";
}

function getRelativeDaysLabel(targetDate: Date) {
  const diffInDays = Math.ceil((targetDate.getTime() - Date.now()) / MILLIS_IN_DAY);
  if (diffInDays <= 0) {
    return "Expire aujourd hui";
  }

  return `Expire dans ${diffInDays}j`;
}

function getGameStatusBadge(game: FirestoreGameDocument, expiresAt: Date | null): DashboardGameBadge {
  if (isGameDraft(game) && !getGameImageUrl(game)) {
    return "a_corriger";
  }
  if (isGamePrivate(game)) {
    return "prive";
  }
  if (expiresAt && expiresAt.getTime() - Date.now() <= 3 * MILLIS_IN_DAY) {
    return "expire_bientot";
  }

  return "actif";
}

function getProgressTone(remainingRatio: number) {
  if (remainingRatio < 0.1) {
    return "red" as const;
  }
  if (remainingRatio < 0.3) {
    return "amber" as const;
  }

  return "green" as const;
}

function getProgressPercent(startDate: Date | null, endDate: Date | null) {
  if (!startDate || !endDate) {
    return 0;
  }

  const total = Math.max(1, endDate.getTime() - startDate.getTime());
  const elapsed = Math.min(total, Math.max(0, Date.now() - startDate.getTime()));
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
}

function getRemainingRatio(startDate: Date | null, endDate: Date | null) {
  if (!startDate || !endDate) {
    return 1;
  }

  const total = Math.max(1, endDate.getTime() - startDate.getTime());
  return Math.max(0, (endDate.getTime() - Date.now()) / total);
}

function getNotificationSegment(rawSegment: string): NotificationSegment {
  const normalized = normalizeStatus(rawSegment);
  if (normalized.includes("ios")) {
    return "iOS inactifs J7";
  }
  if (normalized.includes("amb")) {
    return "Ambassadeurs";
  }

  return "Joueurs actifs";
}

function getNotificationTone(openRate: number) {
  if (openRate >= 60) {
    return "green" as const;
  }
  if (openRate >= 40) {
    return "amber" as const;
  }
  return "red" as const;
}

function formatNotificationDate(date: Date | null, recipients: number) {
  if (!date) {
    return `${formatCount(recipients)} destinataires`;
  }

  const dayLabel = capitalize(new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(date));
  const timeLabel = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  return `${dayLabel} ${timeLabel} - ${formatCount(recipients)} destinataires`;
}

function buildCsv(rows: ActivePlayerExportRow[]) {
  const headers = ["id", "nom", "email", "platform", "sessions", "statut"];
  const lines = rows.map((row) =>
    [row.id, row.displayName, row.email, row.platform, String(row.sessions), row.status]
      .map((value) => `"${value.replaceAll('"', '""')}"`)
      .join(","),
  );

  return `\uFEFF${headers.join(",")}\n${lines.join("\n")}`;
}

export async function exportActivePlayersCsv(rows: ActivePlayerExportRow[]) {
  const csv = buildCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("/", "-");

  anchor.href = url;
  anchor.download = `joueurs-actifs-${dateLabel}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildDashboardData(raw: RawSnapshots): DashboardData {
  const users = raw.users.map((doc) => ({ id: doc.id, data: doc.data() as FirestoreUserDocument }));
  const merchantsDocs =
    raw.merchantsPrimary.length > 0 ? raw.merchantsPrimary : raw.merchantsFallback;
  const merchants = merchantsDocs.map((doc) => ({
    id: doc.id,
    data: doc.data() as FirestoreMerchantDocument,
  }));
  const games = raw.games.map((doc) => ({ id: doc.id, data: doc.data() as FirestoreGameDocument }));
  const notificationsDocs =
    raw.notificationsPrimary.length > 0
      ? raw.notificationsPrimary
      : raw.notificationsFallback;

  const participantsByGameId = new Map<string, number>();
  const participantsLast30dByGameId = new Map<string, number>();

  raw.participants.forEach((doc) => {
    const gameId = doc.ref.parent.parent?.id;
    if (!gameId) {
      return;
    }

    participantsByGameId.set(gameId, (participantsByGameId.get(gameId) ?? 0) + 1);

    const participant = doc.data() as FirestoreParticipantDocument;
    const participantDate =
      participant.participation_date?.toDate() ?? participant.created_time?.toDate() ?? null;

    if (participantDate && participantDate.getTime() >= Date.now() - 30 * MILLIS_IN_DAY) {
      participantsLast30dByGameId.set(gameId, (participantsLast30dByGameId.get(gameId) ?? 0) + 1);
    }
  });

  const gamesByMerchantId = new Map<string, Array<{ id: string; data: FirestoreGameDocument }>>();
  games.forEach((game) => {
    const merchantId = getMerchantId(game.id, game.data);
    const current = gamesByMerchantId.get(merchantId) ?? [];
    current.push(game);
    gamesByMerchantId.set(merchantId, current);
  });

  const activePlayers = users.filter((user) => isUserActive(user.data));
  const activePlayersExport: ActivePlayerExportRow[] = activePlayers.map((user) => ({
    id: user.id,
    displayName: getUserDisplayName(user.id, user.data),
    email: readString(user.data, ["email"], "Non renseigne"),
    platform: getUserPlatform(user.data),
    sessions: getUserSessionCount(user.data),
    status: isUserActive(user.data) ? "actif" : "inactif",
  }));

  const activeGames = games.filter((game) => {
    const endDate = getGameEndDate(game.data);
    return Boolean(endDate && endDate.getTime() >= Date.now());
  });

  const activeMerchantsCount = merchants.filter((merchant) => {
    const merchantGames = gamesByMerchantId.get(merchant.id) ?? [];
    const merchantActiveGames = merchantGames.filter((game) => {
      const badge = getGameStatusBadge(game.data, getGameEndDate(game.data));
      return badge === "actif" || badge === "expire_bientot" || badge === "prive";
    }).length;

    return isMerchantActive(merchant.data, merchantActiveGames);
  }).length;

  const now = new Date();
  const merchantsCreatedThisMonth = merchants.filter((merchant) => {
    const createdAt = readDate(merchant.data, ["created_at", "created_time"]);

    return (
      createdAt !== null &&
      createdAt.getMonth() === now.getMonth() &&
      createdAt.getFullYear() === now.getFullYear()
    );
  }).length;

  const recentIosUsers = users.filter((user) => {
    const createdAt = readDate(user.data, ["created_time", "created_at"]);
    const platform = getUserPlatform(user.data);

    return Boolean(
      createdAt &&
        createdAt.getTime() >= Date.now() - 30 * MILLIS_IN_DAY &&
        (platform.includes("ios") || platform.includes("iphone")),
    );
  });

  const iosRetention = recentIosUsers.length
    ? (recentIosUsers.filter((user) => getUserSessionCount(user.data) > 1).length /
        recentIosUsers.length) *
      100
    : 18;

  const analyticsDocs = raw.analytics.map((doc) => doc.data() as FirestoreAnalyticsDailyDocument);
  const latestAnalytics = [...analyticsDocs].sort((left, right) => {
    const leftValue = readTimestamp(left, ["date", "day"])?.toMillis() ?? 0;
    const rightValue = readTimestamp(right, ["date", "day"])?.toMillis() ?? 0;
    return rightValue - leftValue;
  })[0];

  const dau = latestAnalytics ? readNumber(latestAnalytics, ["dau", "active_users"]) : 0;
  const mau = latestAnalytics ? readNumber(latestAnalytics, ["mau", "monthly_active_users"]) : 0;
  const dauMau = dau > 0 && mau > 0 ? (dau / mau) * 100 : MOCK_DAU_MAU_PERCENT;
  const sessionsCount = raw.gameSessions.length > 0 ? raw.gameSessions.length : raw.participants.length;

  const kpis: DashboardKpi[] = [
    {
      id: "activePlayers",
      label: "Joueurs actifs",
      value: formatCount(activePlayers.length),
      helper: `+${formatCount(activePlayers.filter((user) => getUserSessionCount(user.data) > 0).length)} cette semaine`,
      tone: "success",
      accentBorder: true,
    },
    {
      id: "sessions",
      label: "Parties jouees",
      value: formatCount(sessionsCount),
      helper: "Total cumule",
      tone: "neutral",
    },
    {
      id: "activeMerchants",
      label: "Marchands actifs",
      value: formatCount(activeMerchantsCount),
      helper: `+${formatCount(merchantsCreatedThisMonth)} ce mois`,
      tone: "success",
      accentBorder: merchantsCreatedThisMonth > 0,
    },
    {
      id: "activeGames",
      label: "Jeux en cours",
      value: formatCount(activeGames.length),
      helper: "Campagnes actives",
      tone: "neutral",
    },
    {
      id: "iosRetention",
      label: "Retention J1 iOS",
      value: formatPercent(iosRetention),
      helper: iosRetention < 25 ? "Critique - objectif 40%" : "Dans la cible",
      tone: iosRetention < 25 ? "danger" : "success",
      accentBorder: true,
    },
    {
      id: "dauMau",
      label: "DAU / MAU",
      value: formatPercent(dauMau),
      helper: analyticsDocs.length > 0 ? "Engagement mesure" : "Engagement fort",
      tone: dauMau >= 30 ? "success" : "warning",
    },
  ];

  const bannerAlerts: DashboardAlert[] = [];
  const sideAlerts: OperationsAlertItem[] = [];

  games.forEach((game) => {
    const imageUrl = getGameImageUrl(game.data);
    const expiresAt = getGameEndDate(game.data);
    const merchantName = getMerchantName(game.data);
    const gameName = getGameName(game.data, game.id);

    if (isGameDraft(game.data) && !imageUrl) {
      const alert = {
        id: `draft-image-${game.id}`,
        severity: "critical" as const,
        title: `${merchantName} - ${gameName}`,
        description: "Jeu brouillon sans image, a corriger avant mise en ligne.",
        href: `/admin/games/${game.id}/edit`,
      };
      bannerAlerts.push({ ...alert, ctaLabel: "Voir detail" });
      sideAlerts.push(alert);
    }

    if (expiresAt && expiresAt.getTime() > Date.now() && expiresAt.getTime() - Date.now() <= 3 * MILLIS_IN_DAY) {
      const alert = {
        id: `expiring-${game.id}`,
        severity: "warning" as const,
        title: `${merchantName} - ${gameName}`,
        description: `Jeu expirant bientot (${getRelativeDaysLabel(expiresAt)}).`,
        href: `/admin/games/${game.id}`,
      };
      bannerAlerts.push({ ...alert, ctaLabel: "Voir detail" });
      sideAlerts.push(alert);
    }
  });

  if (iosRetention < 25) {
    bannerAlerts.unshift({
      id: "ios-retention",
      severity: "warning",
      title: "Alerte retention iOS",
      description:
        "Les nouveaux joueurs iOS rejouent peu apres J1. Verifier l onboarding et les notifs push.",
      ctaLabel: "Voir detail",
      href: "/admin/joueurs",
    });
  }

  merchants.forEach((merchant) => {
    const merchantGames = gamesByMerchantId.get(merchant.id) ?? [];
    const merchantName = readString(merchant.data, ["name"], "Marchand");
    const hasActiveGame = merchantGames.some((game) => {
      const badge = getGameStatusBadge(game.data, getGameEndDate(game.data));
      return badge === "actif" || badge === "expire_bientot" || badge === "prive";
    });

    if (!hasActiveGame) {
      sideAlerts.push({
        id: `merchant-no-game-${merchant.id}`,
        severity: "warning",
        title: merchantName,
        description: "Marchand sans jeu actif, relance recommandee.",
        href: `/admin/commercants/${merchant.id}`,
      });
    }
  });

  users.forEach((user) => {
    const referralCount = readNumber(user.data, [
      "referralCount",
      "referrals_count",
      "accepted_referrals_count",
    ]);

    if (referralCount >= 5) {
      sideAlerts.push({
        id: `ambassador-${user.id}`,
        severity: "success",
        title: getUserDisplayName(user.id, user.data),
        description: `${formatCount(referralCount)} parrainages valides, profil ambassadeur a activer.`,
        href: `/admin/parrainage/${user.id}`,
      });
    }
  });

  const activeGamesRows: ActiveGameRow[] = activeGames
    .map((game) => {
      const expiresAt = getGameEndDate(game.data);
      const startDate = getGameStartDate(game.data);
      const status = getGameStatusBadge(game.data, expiresAt);
      const progressPercent = getProgressPercent(startDate, expiresAt);
      const remainingRatio = getRemainingRatio(startDate, expiresAt);

      return {
        id: game.id,
        name: getGameName(game.data, game.id),
        merchantName: getMerchantName(game.data),
        emoji: getGameEmoji(game.data, status),
        status,
        expiresLabel: expiresAt ? getRelativeDaysLabel(expiresAt) : "Date a definir",
        sessionsLabel: `${formatCount(participantsByGameId.get(game.id) ?? 0)} parties`,
        progressPercent,
        progressTone: getProgressTone(remainingRatio),
        href: `/admin/games/${game.id}`,
      };
    })
    .sort((left, right) => {
      const leftGame = games.find((game) => game.id === left.id);
      const rightGame = games.find((game) => game.id === right.id);
      const leftExpires = leftGame ? getGameEndDate(leftGame.data)?.getTime() ?? 0 : 0;
      const rightExpires = rightGame ? getGameEndDate(rightGame.data)?.getTime() ?? 0 : 0;
      return leftExpires - rightExpires;
    })
    .slice(0, 10);

  const merchantsTable: MerchantTableRow[] = merchants
    .map((merchant) => {
      const merchantGames = gamesByMerchantId.get(merchant.id) ?? [];
      const gameStatuses = merchantGames.map((game) => getGameStatusBadge(game.data, getGameEndDate(game.data)));
      const activeGamesCount = gameStatuses.filter((status) => status === "actif" || status === "expire_bientot").length;
      const sessionsLast30d = merchantGames.reduce(
        (total, game) => total + (participantsLast30dByGameId.get(game.id) ?? 0),
        0,
      );

      let status: MerchantDashboardStatus = "actif";
      if (gameStatuses.includes("a_corriger")) {
        status = "a_corriger";
      } else if (gameStatuses.includes("prive")) {
        status = "prive";
      } else if (gameStatuses.includes("expire_bientot")) {
        status = "expire_bientot";
      }
      if (activeGamesCount === 0 && merchantGames.length === 0) {
        status = "a_corriger";
      }

      const actionLabel: MerchantTableRow["actionLabel"] =
        status === "expire_bientot"
          ? "Renouveler"
          : status === "a_corriger" || status === "prive"
            ? "Corriger"
            : "Relancer";

      return {
        id: merchant.id,
        name: readString(merchant.data, ["name"], "Marchand sans nom"),
        activeGames: activeGamesCount,
        sessionsLast30d,
        status,
        actionLabel,
        actionHref:
          actionLabel === "Corriger"
            ? `/admin/commercants/${merchant.id}/edit`
            : `/admin/commercants/${merchant.id}`,
      };
    })
    .sort((left, right) => {
      if (right.activeGames !== left.activeGames) {
        return right.activeGames - left.activeGames;
      }

      return right.sessionsLast30d - left.sessionsLast30d;
    })
    .slice(0, 6);

  const notifications: NotificationItem[] =
    notificationsDocs.length > 0
      ? notificationsDocs
          .map((doc) => {
            const data = doc.data() as FirestorePushNotificationDocument;
            const sentAt = readDate(data, ["sentAt", "sent_at", "created_at"]);
            const recipients = Math.trunc(readNumber(data, ["recipients", "recipientsCount"], 0));
            const openRate = Math.max(0, Math.min(100, readNumber(data, ["openRate", "open_rate"], 0)));

            return {
              id: doc.id,
              title: readString(data, ["title", "notification_title"], "Notification"),
              sentAtLabel: formatNotificationDate(sentAt, recipients),
              recipientsLabel: `${formatCount(recipients)} destinataires`,
              openRate,
              progressTone: getNotificationTone(openRate),
              segment: getNotificationSegment(readString(data, ["segment", "target_user_group"], "all")),
            } satisfies NotificationItem;
          })
          .sort((left, right) => right.openRate - left.openRate)
          .slice(0, 3)
      : MOCK_NOTIFICATIONS;

  return {
    kpis,
    bannerAlerts: bannerAlerts.slice(0, 3),
    activeGames: activeGamesRows,
    sideAlerts: sideAlerts.slice(0, 6),
    merchants: merchantsTable,
    notifications,
    activePlayersExport,
  };
}

export function subscribeDashboardData(
  onData: (data: DashboardData) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const raw: RawSnapshots = {
    users: [],
    merchantsPrimary: [],
    merchantsFallback: [],
    games: [],
    participants: [],
    analytics: [],
    notificationsPrimary: [],
    notificationsFallback: [],
    gameSessions: [],
  };

  const emit = () => {
    onData(buildDashboardData(raw));
  };

  const unsubs: Unsubscribe[] = [
    onSnapshot(collection(db, "users"), (snapshot) => {
      raw.users = snapshot.docs;
      emit();
    }, onError),
    onSnapshot(collection(db, "merchants"), (snapshot) => {
      raw.merchantsPrimary = snapshot.docs;
      emit();
    }, () => {
      raw.merchantsPrimary = [];
      emit();
    }),
    onSnapshot(collection(db, "enseignes"), (snapshot) => {
      raw.merchantsFallback = snapshot.docs;
      emit();
    }, onError),
    onSnapshot(query(collection(db, "games"), orderBy("end_date", "asc")), (snapshot) => {
      raw.games = snapshot.docs;
      emit();
    }, onError),
    onSnapshot(collectionGroup(db, "participants"), (snapshot) => {
      raw.participants = snapshot.docs;
      emit();
    }, onError),
    onSnapshot(query(collection(db, "analytics_daily"), orderBy("date", "desc")), (snapshot) => {
      raw.analytics = snapshot.docs;
      emit();
    }, () => {
      raw.analytics = [];
      emit();
    }),
    onSnapshot(collection(db, "push_notifications"), (snapshot) => {
      raw.notificationsPrimary = snapshot.docs;
      emit();
    }, () => {
      raw.notificationsPrimary = [];
      emit();
    }),
    onSnapshot(collection(db, "ff_push_notifications"), (snapshot) => {
      raw.notificationsFallback = snapshot.docs;
      emit();
    }, () => {
      raw.notificationsFallback = [];
      emit();
    }),
    onSnapshot(collection(db, "game_sessions"), (snapshot) => {
      raw.gameSessions = snapshot.docs;
      emit();
    }, () => {
      raw.gameSessions = [];
      emit();
    }),
  ];

  return () => {
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
}
