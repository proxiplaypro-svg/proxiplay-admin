"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { sendBulkReminder } from "@/lib/firebase/adminActions";
import {
  exportActivePlayersCsv,
  subscribeDashboardData,
} from "@/lib/firebase/dashboardQueries";
import { getMerchantsPilotageData } from "@/lib/firebase/merchantsQueries";
import type {
  DashboardAlert,
  DashboardData,
  DashboardKpi,
  MerchantPilotageItem,
  NotificationItem,
  NotificationSegment,
  OperationsAlertItem,
} from "@/types/dashboard";

const initialData: DashboardData = {
  kpis: [],
  bannerAlerts: [],
  activeGames: [],
  sideAlerts: [],
  merchants: [],
  notifications: [],
  activePlayersExport: [],
};

function formatFrenchDate(date: Date) {
  const formatted = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function getKpiAccentColor(kpi: DashboardKpi) {
  switch (kpi.id) {
    case "activePlayers":
    case "activeMerchants":
    case "dauMau":
      return "#639922";
    case "iosRetention":
      return "#E24B4A";
    default:
      return "#E8E8E4";
  }
}

function getKpiValueColor(kpi: DashboardKpi) {
  return kpi.id === "iosRetention" && kpi.tone === "danger" ? "#A32D2D" : "#1A1A1A";
}

function getKpiHelperColor(kpi: DashboardKpi) {
  if (kpi.tone === "success") {
    return "#3B6D11";
  }

  if (kpi.tone === "danger") {
    return "#A32D2D";
  }

  return "#999999";
}

function getAlertTone(severity: DashboardAlert["severity"] | OperationsAlertItem["severity"]) {
  switch (severity) {
    case "critical":
      return {
        dot: "bg-[#E24B4A]",
        subtle: "bg-[#FCEBEB]",
        text: "text-[#A32D2D]",
      };
    case "success":
      return {
        dot: "bg-[#639922]",
        subtle: "bg-[#EAF3DE]",
        text: "text-[#3B6D11]",
      };
    default:
      return {
        dot: "bg-[#EF9F27]",
        subtle: "bg-[#FAEEDA]",
        text: "text-[#633806]",
      };
  }
}

function getGameStatusBadge(status: string) {
  switch (status) {
    case "a_corriger":
      return "bg-[#FCEBEB] text-[#A32D2D]";
    case "expire_bientot":
      return "bg-[#FAEEDA] text-[#633806]";
    case "prive":
      return "bg-[#E6F1FB] text-[#185FA5]";
    default:
      return "bg-[#EAF3DE] text-[#3B6D11]";
  }
}

function getGameStatusLabel(status: string) {
  switch (status) {
    case "a_corriger":
      return "a corriger";
    case "expire_bientot":
      return "expire bientot";
    case "prive":
      return "prive";
    default:
      return "actif";
  }
}

function getProgressColor(tone: string) {
  switch (tone) {
    case "red":
      return "#E24B4A";
    case "amber":
      return "#EF9F27";
    default:
      return "#639922";
  }
}

function getMerchantAvatarColors(score: number) {
  if (score <= 15) {
    return "bg-[#FCEBEB] text-[#A32D2D]";
  }

  if (score <= 35) {
    return "bg-[#FAEEDA] text-[#633806]";
  }

  return "bg-[#EAF3DE] text-[#3B6D11]";
}

function formatMerchantMeta(merchant: MerchantPilotageItem) {
  const lastContact = merchant.lastContactDateValue > 0 ? merchant.lastContactDateLabel : "Jamais";
  const gamesLabel = merchant.gamesActiveCount > 1 ? "jeux actifs" : "jeu actif";

  return `${merchant.gamesActiveCount} ${gamesLabel} · relance ${lastContact} · score ${merchant.engagementScore}`;
}

function getMerchantActionLabel(merchant: MerchantPilotageItem) {
  return merchant.status === "inactif" ? "Corriger" : "Relancer";
}

function getMerchantActionHref(merchant: MerchantPilotageItem) {
  return merchant.status === "inactif"
    ? `/admin/commercants/${merchant.id}/edit`
    : `/admin/commercants/${merchant.id}`;
}

function getNotificationBarColor(tone: NotificationItem["progressTone"]) {
  switch (tone) {
    case "red":
      return "#E24B4A";
    case "amber":
      return "#EF9F27";
    default:
      return "#639922";
  }
}

function getSegmentBadgeClasses(segment: NotificationSegment, active: boolean) {
  const base =
    "rounded-full px-3 py-[5px] text-[11px] transition border";

  if (segment === "Joueurs actifs") {
    return `${base} ${
      active
        ? "border-[#C0DD97] bg-[#EAF3DE] text-[#3B6D11]"
        : "border-transparent bg-[#EEF5E5] text-[#5C8C24]"
    }`;
  }

  if (segment === "iOS inactifs J7") {
    return `${base} ${
      active
        ? "border-[#B7D3F0] bg-[#E6F1FB] text-[#185FA5]"
        : "border-transparent bg-[#EEF6FD] text-[#378ADD]"
    }`;
  }

  return `${base} ${
    active
      ? "border-[#D4D0FB] bg-[#EEEDFE] text-[#534AB7]"
      : "border-transparent bg-[#F3F1FF] text-[#6B62D8]"
  }`;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData>(initialData);
  const [merchantsToContact, setMerchantsToContact] = useState<MerchantPilotageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [merchantsLoading, setMerchantsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkReminderPending, setBulkReminderPending] = useState(false);
  const [bulkReminderFeedback, setBulkReminderFeedback] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<NotificationSegment | "Tous">("Tous");

  useEffect(() => {
    const unsubscribe = subscribeDashboardData(
      (nextData) => {
        setData(nextData);
        setLoading(false);
      },
      (subscriptionError) => {
        console.error(subscriptionError);
        setError("Impossible de synchroniser le dashboard en temps reel.");
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    let active = true;

    const loadMerchants = async () => {
      setMerchantsLoading(true);

      try {
        const result = await getMerchantsPilotageData();

        if (!active) {
          return;
        }

        setMerchantsToContact(
          [...result.merchants]
            .sort((left, right) => left.engagementScore - right.engagementScore)
            .slice(0, 6),
        );
      } catch (merchantsError) {
        console.error(merchantsError);

        if (active) {
          setError((current) => current ?? "Impossible de charger les marchands a relancer.");
        }
      } finally {
        if (active) {
          setMerchantsLoading(false);
        }
      }
    };

    void loadMerchants();

    return () => {
      active = false;
    };
  }, []);

  const todayLabel = useMemo(() => `${formatFrenchDate(new Date())} · Dunkerque`, []);

  const activeAlert = useMemo(() => {
    return data.bannerAlerts[0] ?? null;
  }, [data.bannerAlerts]);

  const filteredNotifications = useMemo(() => {
    if (selectedSegment === "Tous") {
      return data.notifications;
    }

    return data.notifications.filter((notification) => notification.segment === selectedSegment);
  }, [data.notifications, selectedSegment]);

  const visibleNotifications = useMemo(() => filteredNotifications.slice(0, 3), [filteredNotifications]);

  const notificationSegments = useMemo(() => {
    const allSegments: NotificationSegment[] = ["Joueurs actifs", "iOS inactifs J7", "Ambassadeurs"];

    return allSegments.map((segment) => ({
      segment,
      count: data.notifications.filter((item) => item.segment === segment).length,
    }));
  }, [data.notifications]);

  const handleExport = async () => {
    await exportActivePlayersCsv(data.activePlayersExport);
  };

  const handleBulkReminder = async () => {
    try {
      setBulkReminderPending(true);
      setBulkReminderFeedback(null);
      const result = await sendBulkReminder();
      setBulkReminderFeedback(`${result.remindedCount} marchands relances.`);
    } catch (actionError) {
      console.error(actionError);
      setBulkReminderFeedback("La relance groupee a echoue.");
    } finally {
      setBulkReminderPending(false);
    }
  };

  return (
    <section className="space-y-4 text-[#1A1A1A]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1A1A1A]">
            Tableau de bord
          </h1>
          <p className="mt-2 text-[13px] text-[#999999]">{todayLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-[#EAF3DE] px-4 py-2 text-[#3B6D11]">
            <span className="h-2 w-2 rounded-full bg-[#639922]" aria-hidden="true" />
            <span className="text-[12px] font-medium">Live</span>
          </div>

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={data.activePlayersExport.length === 0}
            className="rounded-[10px] border border-[#E0E0DA] bg-white px-4 py-[10px] text-[12px] text-[#1A1A1A] transition hover:bg-[#F7F7F5] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Exporter CSV
          </button>

          <Link
            href="/admin/games/new"
            className="rounded-[10px] border border-[#639922] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white transition hover:bg-[#57881D]"
          >
            + Nouveau jeu
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-[10px] border border-[#F2CACA] bg-[#FCEBEB] px-4 py-3 text-[12px] text-[#A32D2D]">
          {error}
        </div>
      ) : null}

      {bulkReminderFeedback ? (
        <div className="rounded-[10px] border border-[#E8E8E4] bg-white px-4 py-3 text-[12px] text-[#666666]">
          {bulkReminderFeedback}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-[136px] animate-pulse rounded-[10px] border border-[#E8E8E4] bg-white"
              />
            ))
          : data.kpis.map((kpi) => (
              <article
                key={kpi.id}
                className="overflow-hidden rounded-[10px] border border-[#E8E8E4] bg-white"
              >
                <div className="h-[3px]" style={{ backgroundColor: getKpiAccentColor(kpi) }} />
                <div className="space-y-2 px-4 py-4">
                  <p className="text-[11px] text-[#999999]">{kpi.label}</p>
                  <strong
                    className="block text-[22px] font-medium leading-none"
                    style={{ color: getKpiValueColor(kpi) }}
                  >
                    {kpi.value}
                  </strong>
                  <p
                    className="text-[11px] leading-[1.35]"
                    style={{ color: getKpiHelperColor(kpi) }}
                  >
                    {kpi.helper}
                  </p>
                </div>
              </article>
            ))}
      </div>

      {activeAlert ? (
        <div className="flex flex-col gap-4 rounded-[10px] border border-[#FAC775] bg-[#FFFBF0] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-[#FAEEDA] text-[20px] text-[#633806]">
              ⚠
            </div>
            <div>
              <h2 className="text-[14px] font-medium text-[#633806]">{activeAlert.title}</h2>
              <p className="mt-1 max-w-[700px] text-[13px] leading-[1.45] text-[#854F0B]">
                {activeAlert.description}
              </p>
            </div>
          </div>
          {activeAlert.href ? (
            <Link
              href={activeAlert.href}
              className="inline-flex items-center justify-center rounded-[10px] border border-[#F0DFB8] bg-white px-4 py-[10px] text-[12px] font-medium text-[#633806] transition hover:bg-[#FFF7E8]"
            >
              Voir le detail
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="overflow-hidden rounded-[12px] border border-[#E8E8E4] bg-white">
          <div className="flex items-center justify-between border-b border-[#F0F0EC] px-5 py-4">
            <div>
              <h2 className="text-[15px] font-medium text-[#1A1A1A]">Jeux & campagnes actives</h2>
            </div>
            <Link href="/admin/games" className="text-[12px] font-medium text-[#639922]">
              Voir tous →
            </Link>
          </div>

          <div className="divide-y divide-[#F0F0EC] px-5">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center gap-4 py-4">
                  <div className="h-9 w-9 animate-pulse rounded-[8px] bg-[#F7F7F5]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-48 animate-pulse rounded bg-[#F7F7F5]" />
                    <div className="h-3 w-36 animate-pulse rounded bg-[#F7F7F5]" />
                  </div>
                </div>
              ))
            ) : data.activeGames.length > 0 ? (
              data.activeGames.map((game) => (
                <Link
                  key={game.id}
                  href={game.href}
                  className="flex items-center gap-4 py-4 transition hover:bg-[#FCFCFA]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#F3F0E6] text-[18px]">
                    {game.emoji}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-[#1A1A1A]">
                          {game.name} — {game.merchantName}
                        </p>
                        <p className="mt-1 text-[11px] text-[#999999]">
                          {game.expiresLabel} · {game.sessionsLabel}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-3 py-[4px] text-[10px] font-medium ${getGameStatusBadge(game.status)}`}
                      >
                        {getGameStatusLabel(game.status)}
                      </span>
                    </div>

                    <div className="mt-3 h-[3px] rounded-full bg-[#F0F0EC]">
                      <div
                        className="h-[3px] rounded-full"
                        style={{
                          width: `${Math.max(8, game.progressPercent)}%`,
                          backgroundColor: getProgressColor(game.progressTone),
                        }}
                      />
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="py-8 text-[12px] text-[#999999]">Aucun jeu actif a afficher.</div>
            )}
          </div>
        </section>

        <div className="space-y-4">
          <section className="overflow-hidden rounded-[12px] border border-[#E8E8E4] bg-white">
            <div className="border-b border-[#F0F0EC] px-5 py-4">
              <h2 className="text-[15px] font-medium text-[#1A1A1A]">Alertes & actions</h2>
              <p className="mt-1 text-[11px] text-[#999999]">Donnees temps reel depuis Firestore</p>
            </div>

            <div className="space-y-4 px-5 py-4">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex gap-3">
                    <div className="mt-1 h-2.5 w-2.5 animate-pulse rounded-full bg-[#F0F0EC]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-32 animate-pulse rounded bg-[#F7F7F5]" />
                      <div className="h-3 w-full animate-pulse rounded bg-[#F7F7F5]" />
                    </div>
                  </div>
                ))
              ) : data.sideAlerts.length > 0 ? (
                data.sideAlerts.slice(0, 4).map((alert) => {
                  const tone = getAlertTone(alert.severity);

                  return (
                    <Link
                      key={alert.id}
                      href={alert.href ?? "/admin/dashboard"}
                      className="flex gap-3 rounded-[10px] border border-transparent p-1 transition hover:border-[#E8E8E4] hover:bg-[#FCFCFA]"
                    >
                      <span className={`mt-[6px] h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-medium text-[#1A1A1A]">{alert.title}</p>
                        <p className="mt-1 text-[11px] leading-[1.45] text-[#999999]">
                          {alert.description}
                        </p>
                      </div>
                    </Link>
                  );
                })
              ) : (
                <p className="text-[12px] text-[#999999]">Aucune alerte prioritaire.</p>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-[12px] border border-[#E8E8E4] bg-white">
            <div className="border-b border-[#F0F0EC] px-5 py-4">
              <h2 className="text-[15px] font-medium text-[#1A1A1A]">Actions rapides</h2>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4">
              <Link
                href="/admin/notifications/nouvelle"
                className="rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-4 text-[12px] text-[#666666] transition hover:border-[#C0DD97] hover:bg-[#EAF3DE] hover:text-[#3B6D11]"
              >
                Notif push
              </Link>
              <Link
                href="/admin/games/new"
                className="rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-4 text-[12px] text-[#666666] transition hover:border-[#C0DD97] hover:bg-[#EAF3DE] hover:text-[#3B6D11]"
              >
                Creer jeu
              </Link>
              <Link
                href="/admin/commercants"
                className="rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-4 text-[12px] text-[#666666] transition hover:border-[#C0DD97] hover:bg-[#EAF3DE] hover:text-[#3B6D11]"
              >
                Ajouter marchand
              </Link>
              <button
                type="button"
                onClick={() => void handleBulkReminder()}
                disabled={bulkReminderPending}
                className="rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-4 text-left text-[12px] text-[#666666] transition hover:border-[#C0DD97] hover:bg-[#EAF3DE] hover:text-[#3B6D11] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkReminderPending ? "Relance..." : "Relancer"}
              </button>
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-[12px] border border-[#E8E8E4] bg-white">
          <div className="flex items-center justify-between border-b border-[#F0F0EC] px-5 py-4">
            <h2 className="text-[15px] font-medium text-[#1A1A1A]">Marchands a relancer</h2>
            <Link href="/admin/commercants" className="text-[12px] font-medium text-[#639922]">
              Gerer →
            </Link>
          </div>

          <div className="divide-y divide-[#F0F0EC] px-5">
            {merchantsLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center gap-4 py-4">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-[#F7F7F5]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-40 animate-pulse rounded bg-[#F7F7F5]" />
                    <div className="h-3 w-56 animate-pulse rounded bg-[#F7F7F5]" />
                  </div>
                </div>
              ))
            ) : merchantsToContact.length > 0 ? (
              merchantsToContact.map((merchant) => (
                <div key={merchant.id} className="flex items-center gap-4 py-4">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium ${getMerchantAvatarColors(
                      merchant.engagementScore,
                    )}`}
                  >
                    {merchant.initials}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium text-[#1A1A1A]">{merchant.name}</p>
                    <p className="mt-1 text-[11px] leading-[1.4] text-[#999999]">
                      {formatMerchantMeta(merchant)}
                    </p>
                  </div>

                  <Link
                    href={getMerchantActionHref(merchant)}
                    className="shrink-0 text-[12px] font-medium text-[#639922]"
                  >
                    {getMerchantActionLabel(merchant)} →
                  </Link>
                </div>
              ))
            ) : (
              <div className="py-8 text-[12px] text-[#999999]">Aucun marchand a relancer.</div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-[12px] border border-[#E8E8E4] bg-white">
          <div className="flex items-center justify-between border-b border-[#F0F0EC] px-5 py-4">
            <h2 className="text-[15px] font-medium text-[#1A1A1A]">Notifications push</h2>
            <Link
              href="/admin/notifications/nouvelle"
              className="rounded-[10px] border border-[#E8E8E4] bg-white px-4 py-[8px] text-[12px] text-[#999999] transition hover:bg-[#F7F7F5] hover:text-[#666666]"
            >
              Nouvelle notif
            </Link>
          </div>

          <div className="divide-y divide-[#F0F0EC] px-5">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="space-y-2 py-4">
                  <div className="h-3 w-52 animate-pulse rounded bg-[#F7F7F5]" />
                  <div className="h-3 w-40 animate-pulse rounded bg-[#F7F7F5]" />
                </div>
              ))
            ) : visibleNotifications.length > 0 ? (
              visibleNotifications.map((notification) => (
                <article key={notification.id} className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-[#1A1A1A]">
                        {notification.title}
                      </p>
                      <p className="mt-1 text-[11px] text-[#999999]">
                        {notification.sentAtLabel}
                      </p>
                    </div>
                    <div className="shrink-0 text-[12px] font-medium text-[#3B6D11]">
                      {notification.openRate}%
                    </div>
                  </div>
                  <div className="mt-3 h-[3px] rounded-full bg-[#F0F0EC]">
                    <div
                      className="h-[3px] rounded-full"
                      style={{
                        width: `${Math.max(8, notification.openRate)}%`,
                        backgroundColor: getNotificationBarColor(notification.progressTone),
                      }}
                    />
                  </div>
                </article>
              ))
            ) : (
              <div className="py-8 text-[12px] text-[#999999]">Aucune notification recente.</div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[#F0F0EC] px-5 py-4">
            <button
              type="button"
              onClick={() => setSelectedSegment("Tous")}
              className={`rounded-full border px-3 py-[5px] text-[11px] transition ${
                selectedSegment === "Tous"
                  ? "border-[#E0E0DA] bg-[#F7F7F5] text-[#666666]"
                  : "border-transparent bg-[#FAFAF8] text-[#999999]"
              }`}
            >
              Tous
            </button>
            {notificationSegments.map((item) => (
              <button
                key={item.segment}
                type="button"
                onClick={() => setSelectedSegment(item.segment)}
                className={getSegmentBadgeClasses(item.segment, selectedSegment === item.segment)}
              >
                {item.segment} ({item.count})
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
