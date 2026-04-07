export type DashboardKpiTone = "neutral" | "success" | "warning" | "danger";

export type DashboardAlertSeverity = "critical" | "warning" | "success";

export type DashboardGameBadge = "actif" | "expire_bientot" | "prive" | "a_corriger";

export type MerchantDashboardStatus = "actif" | "expire_bientot" | "prive" | "a_corriger";

export type NotificationSegment =
  | "Joueurs actifs"
  | "iOS inactifs J7"
  | "Ambassadeurs";

export interface DashboardKpi {
  id:
    | "activePlayers"
    | "sessions"
    | "activeMerchants"
    | "activeGames"
    | "iosRetention"
    | "dauMau";
  label: string;
  value: string;
  helper: string;
  tone: DashboardKpiTone;
  accentBorder?: boolean;
}

export interface DashboardAlert {
  id: string;
  severity: DashboardAlertSeverity;
  title: string;
  description: string;
  ctaLabel?: string;
  href?: string;
}

export interface ActiveGameRow {
  id: string;
  name: string;
  merchantName: string;
  emoji: string;
  status: DashboardGameBadge;
  expiresLabel: string;
  sessionsLabel: string;
  progressPercent: number;
  progressTone: "green" | "amber" | "red";
  href: string;
}

export interface OperationsAlertItem {
  id: string;
  severity: DashboardAlertSeverity;
  title: string;
  description: string;
  href?: string;
}

export interface MerchantTableRow {
  id: string;
  name: string;
  activeGames: number;
  sessionsLast30d: number;
  status: MerchantDashboardStatus;
  actionLabel: "Renouveler" | "Corriger" | "Relancer";
  actionHref: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  sentAtLabel: string;
  recipientsLabel: string;
  openRate: number;
  progressTone: "green" | "amber" | "red";
  segment: NotificationSegment;
}

export interface ActivePlayerExportRow {
  id: string;
  displayName: string;
  email: string;
  platform: string;
  sessions: number;
  status: string;
}

export interface DashboardData {
  kpis: DashboardKpi[];
  bannerAlerts: DashboardAlert[];
  activeGames: ActiveGameRow[];
  sideAlerts: OperationsAlertItem[];
  merchants: MerchantTableRow[];
  notifications: NotificationItem[];
  activePlayersExport: ActivePlayerExportRow[];
}

export type GameStatus = "actif" | "expire" | "brouillon" | "prive";

export interface GameSecondaryPrize {
  id: string;
  name: string;
  description: string;
  count: string;
  image: string | null;
}

export interface Game {
  id: string;
  title: string;
  description: string;
  merchantId: string | null;
  merchantName: string;
  startDate: string | null;
  endDate: string | null;
  startDateValue: number | null;
  endDateValue: number | null;
  status: GameStatus;
  imageUrl: string | null;
  isPrivate: boolean;
  sessionCount: number;
  collectionName: "games" | "jeux";
  imageMissing: boolean;
  hasMainPrize: boolean;
  mainPrizeTitle: string;
  mainPrizeDescription: string;
  mainPrizeValue: string;
  mainPrizeImage: string | null;
  secondaryPrizes: GameSecondaryPrize[];
}

export interface GameMerchantOption {
  id: string;
  name: string;
  collectionName: "enseignes" | "merchants";
}

export type MerchantPilotageStatus = "actif" | "a_relancer" | "inactif";
export type MerchantPilotageFilter = "tous" | "a_relancer" | "sans_jeu_actif" | "actifs";
export type MerchantPilotageSort =
  | "score_desc"
  | "last_contact_desc"
  | "participations_desc"
  | "name_asc";

export interface MerchantRelanceHistoryItem {
  id: string;
  channel: "email" | "whatsapp" | "manual";
  label: string;
  note: string;
  timestampLabel: string;
  timestampValue: number;
}

export interface MerchantActiveGameSummary {
  id: string;
  name: string;
  imageUrl: string | null;
  status: "actif" | "expire_bientot" | "brouillon" | "expire";
  expiryLabel: string;
  participationsLabel: string;
  sessionsCount: number;
  endDateValue: number;
}

export interface MerchantPilotageItem {
  id: string;
  name: string;
  city: string;
  email: string;
  phone: string;
  merchantCollectionName: "enseignes" | "merchants";
  gamesCollectionName: "games" | "jeux";
  commercialStatus: "" | "actif" | "a_relancer" | "inactif";
  lastContactDate: string | null;
  lastContactDateLabel: string;
  lastContactDateValue: number;
  lastContactChannel: string;
  gamesActiveCount: number;
  clicksJ30: number;
  participationsJ30: number;
  gainsRemis: number;
  engagementScore: number;
  status: MerchantPilotageStatus;
  initials: string;
  activeGames: MerchantActiveGameSummary[];
  relanceHistory: MerchantRelanceHistoryItem[];
}

export interface PushNotification {
  id: string;
  title: string;
  message: string;
  imageUrl: string;
  sound: string;
  initialPageName: string;
  parameterData: string;
  scheduledTimeLabel: string;
  scheduledTimeValue: number;
  createdAtLabel: string;
  createdAtValue: number;
  status: string;
  targetAudience: string;
  targetUserGroup: string;
  userRefs: string;
  deliveryCount: number | null;
}
