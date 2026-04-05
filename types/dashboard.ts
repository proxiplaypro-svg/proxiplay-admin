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
