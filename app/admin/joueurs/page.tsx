"use client";

import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getPlayersList,
  getPlayersPushStatuses,
  type AdminPlayerListItem,
} from "@/lib/firebase/adminQueries";
import { auth } from "@/lib/firebase/auth";
import { createAdminPlayerPushBatch } from "@/lib/firebase/notificationsQueries";
import {
  buildPlayerPushBatches,
  runPlayerPushBatches,
  type PlayerPushBatch,
  type PlayerPushBatchResult,
} from "@/lib/firebase/playerPushBatches";
import { PLAYER_PUSH_SCHEDULING_ENABLED, formatParisScheduledTime, resolvePlayerPushScheduledTime } from "@/lib/firebase/playerPushSchedule";

type FollowUpFilter = "tous" | "a_faire" | "relance" | "sans_reponse" | "ok";
type ActivityFilter = "tous" | "actif" | "inactif";
type LastContactSort = "recent_first" | "oldest_first" | "never_first";
type FeedbackState = { tone: "success" | "error"; text: string } | null;
type PushModalState = {
  open: boolean;
  userIds: string[];
  title: string;
  message: string;
  heading: string;
  description: string;
};
type PushCampaignReport = {
  title: string;
  totalPlayers: number;
  totalBatches: number;
  testMode: boolean;
  startedAt: string;
  scheduledTimeMs: number | null;
  batches: PlayerPushBatch[];
  results: PlayerPushBatchResult[];
};
const pushCampaignStorageKey = "proxiplay-admin-player-push-campaign";
type AnalyticsChartPoint = { label: string; value: number };
type AnalyticsDataset = {
  data: number[];
  label?: string;
  borderColor?: string;
  backgroundColor?: string | CanvasGradient;
  fill?: boolean;
  tension?: number;
  borderWidth?: number;
  pointRadius?: number;
  pointHoverRadius?: number;
  borderRadius?: number;
  maxBarThickness?: number;
};
type AnalyticsChartConfig = {
  type: "line" | "bar";
  data: {
    labels: string[];
    datasets: AnalyticsDataset[];
  };
  options?: {
    responsive?: boolean;
    maintainAspectRatio?: boolean;
    plugins?: {
      legend?: { display?: boolean };
      tooltip?: {
        displayColors?: boolean;
        callbacks?: {
          label?: (context: { parsed: { y: number } }) => string;
        };
      };
    };
    scales?: {
      x?: {
        grid?: { display?: boolean; drawBorder?: boolean };
        ticks?: { color?: string; font?: { size?: number } };
      };
      y?: {
        beginAtZero?: boolean;
        ticks?: { precision?: number; color?: string; font?: { size?: number } };
        grid?: { color?: string; drawBorder?: boolean };
      };
    };
  };
};
type AnalyticsChartInstance = { destroy: () => void };
type AnalyticsChartConstructor = new (
  item: HTMLCanvasElement | CanvasRenderingContext2D,
  config: AnalyticsChartConfig,
) => AnalyticsChartInstance;

declare global {
  interface Window {
    Chart?: AnalyticsChartConstructor;
  }
}

const thClass = "px-[14px] py-[10px] text-left text-[10.5px] uppercase tracking-[0.05em] text-[#999999]";
const analyticsCardStyle = { borderWidth: "0.5px", borderColor: "#E8E8E4" } as const;
const chartHeight = 180;
const dayInMs = 24 * 60 * 60 * 1000;

function n(v: string) {
  return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function fmt(v: number | null) {
  return v === null ? "Non renseigne" : new Intl.NumberFormat("fr-FR").format(v);
}
function formatCount(v: number) {
  return new Intl.NumberFormat("fr-FR").format(v);
}
function formatPercent(v: number) {
  return `${Math.round(v)}%`;
}
function formatAveragePlayed(v: number) {
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)} / 3`;
}
function label(p: AdminPlayerListItem) {
  return p.fullName !== "Non renseigne" ? p.fullName : p.email !== "Non renseigne" ? p.email : "Non renseigne";
}
function initials(p: AdminPlayerListItem) {
  return label(p).split(/[.\s@_-]+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? "").join("") || "PP";
}
function activityColors(p: AdminPlayerListItem) {
  return p.assiduityLabel === "Tres actif" || p.assiduityLabel === "Actif"
    ? { avatar: "bg-[#EAF3DE] text-[#3B6D11]", badge: "bg-[#EAF3DE] text-[#3B6D11]" }
    : p.assiduityLabel === "A relancer"
      ? { avatar: "bg-[#FAEEDA] text-[#633806]", badge: "bg-[#FAEEDA] text-[#633806]" }
      : p.assiduityLabel === "Jamais actif"
        ? { avatar: "bg-[#F7F7F5] text-[#666666]", badge: "bg-[#F1EFE8] text-[#5F5E5A]" }
        : { avatar: "bg-[#FCEBEB] text-[#A32D2D]", badge: "bg-[#FCEBEB] text-[#A32D2D]" };
}
function getBulkPushModalState(userIds: string[]): PushModalState {
  return {
    open: true,
    userIds,
    title: "",
    message: "",
    heading: "Envoyer une notif push",
    description: "La notification sera créée dans ff_push_notifications pour les joueurs sélectionnés.",
  };
}
function startOfLocalDay(value: number | Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}
function formatDayKey(value: number) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(new Date(value));
}
function isActiveForUsage(player: AdminPlayerListItem) {
  const normalizedStatus = n(player.playerStatusCached);
  return normalizedStatus === "actif" || (normalizedStatus === "non renseigne" && player.activityState === "actif");
}
function buildLastThirtyDaysSeries(points: Array<{ timestamp: number; include: boolean }>) {
  const today = startOfLocalDay(Date.now()).getTime();
  const start = today - 29 * dayInMs;
  const counts = new Map<number, number>();

  for (let cursor = start; cursor <= today; cursor += dayInMs) counts.set(cursor, 0);

  points.forEach((point) => {
    if (!point.include || point.timestamp < start || point.timestamp > today + dayInMs - 1) return;
    const day = startOfLocalDay(point.timestamp).getTime();
    counts.set(day, (counts.get(day) ?? 0) + 1);
  });

  return {
    series: [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([timestamp, value]) => ({ label: formatDayKey(timestamp), value })),
    populatedDayCount: new Set(points.filter((point) => point.include && point.timestamp >= start && point.timestamp <= today + dayInMs - 1).map((point) => startOfLocalDay(point.timestamp).getTime())).size,
  };
}
function AnalyticsChartFallback({ message }: { message: string }) {
  return <div className="flex h-full items-center justify-center rounded-[10px] border border-dashed border-[#E8E8E4] bg-[#FAFAF8] px-4 text-center text-[11px] text-[#999999]">{message}</div>;
}

export default function AdminPlayersPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<AdminPlayerListItem[]>([]);
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("tous");
  const [statusFilter, setStatusFilter] = useState("tous");
  const [pushFilter, setPushFilter] = useState<"tous" | "actif" | "inconnu">("tous");
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>("tous");
  const [lastContactSort, setLastContactSort] = useState<LastContactSort>("recent_first");
  const [cityFilter, setCityFilter] = useState("toutes");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [pushSubmitting, setPushSubmitting] = useState(false);
  const [pushConfirming, setPushConfirming] = useState(false);
  const [pushTestMode, setPushTestMode] = useState(false);
  const [pushTestIds, setPushTestIds] = useState<Set<string>>(new Set());
  const [pushTestSearch, setPushTestSearch] = useState("");
  const [pushScheduleMode, setPushScheduleMode] = useState<"now" | "later">("now");
  const [pushScheduleLocal, setPushScheduleLocal] = useState("");
  const [pushConfirmedScheduleMs, setPushConfirmedScheduleMs] = useState<number | null>(null);
  const [pushCampaignReport, setPushCampaignReport] = useState<PushCampaignReport | null>(null);
  const pushSendingRef = useRef(false);
  const [pushModal, setPushModal] = useState<PushModalState>({
    open: false,
    userIds: [],
    title: "",
    message: "",
    heading: "",
    description: "",
  });
  const [chartJsReady, setChartJsReady] = useState(false);
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const exhaustedChartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signupsChartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const exhaustedChartRef = useRef<AnalyticsChartInstance | null>(null);
  const signupsChartRef = useRef<AnalyticsChartInstance | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(pushCampaignStorageKey);
      if (saved) setPushCampaignReport(JSON.parse(saved) as PushCampaignReport);
    } catch { /* A private browsing session may block storage. */ }
  }, []);

  useEffect(() => {
    if (!pushCampaignReport) return;
    try { sessionStorage.setItem(pushCampaignStorageKey, JSON.stringify(pushCampaignReport)); }
    catch { /* The current page still retains the results. */ }
  }, [pushCampaignReport]);

  useEffect(() => {
    if (window.Chart) setChartJsReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true); setError(null);
      try {
        const items = await getPlayersList();
        if (!cancelled) setPlayers(items);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Impossible de charger la liste des joueurs depuis Firestore.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const statuses = useMemo(() => [...new Set(players.map((p) => p.playerStatusCached).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [players]);
  const cities = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((p) => {
      if (p.city === "Non renseignee" || n(p.city).length < 3) return;
      if (!map.has(n(p.city))) map.set(n(p.city), p.city);
    });
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [players]);

  const base = useMemo(() => players.filter((p) => {
    const q = n(search.trim());
    const matchSearch = q.length === 0 || n(label(p)).includes(q) || n(p.fullName).includes(q) || n(p.email).includes(q) || n(p.city).includes(q);
    const matchActivity = activityFilter === "tous" || (activityFilter === "actif" && p.activityState === "actif") || (activityFilter === "inactif" && (p.activityState === "inactif" || p.activityState === "jamais"));
    const matchStatus = statusFilter === "tous" || p.playerStatusCached === statusFilter;
    const matchFollow = followUpFilter === "tous" || p.followUp.followUpStatus === followUpFilter;
    const matchCity = cityFilter === "toutes" || n(p.city) === cityFilter;
    return matchSearch && matchActivity && matchStatus && matchFollow && matchCity;
  }), [activityFilter, cityFilter, followUpFilter, players, search, statusFilter]);

  const pendingPush = useMemo(() => pushFilter === "tous" ? [] : base.filter((p) => p.pushStatus === "non_verifie").map((p) => p.id), [base, pushFilter]);
  useEffect(() => {
    if (pendingPush.length === 0) return;
    let cancelled = false;
    const run = async () => {
      try {
        const statusesMap = await getPlayersPushStatuses(pendingPush);
        if (cancelled) return;
        setPlayers((cur) => cur.map((p) => statusesMap.get(p.id) ? { ...p, pushStatus: statusesMap.get(p.id)! } : p));
      } catch (e) { console.error(e); }
    };
    void run();
    return () => { cancelled = true; };
  }, [pendingPush]);

  const filtered = useMemo(() => {
    const pushReady = pushFilter === "tous" ? base : base.filter((p) => p.pushStatus === pushFilter || p.pushStatus === "non_verifie");
    return [...pushReady].sort((a, b) => {
      if (lastContactSort === "never_first" && a.followUp.hasLastContact !== b.followUp.hasLastContact) return a.followUp.hasLastContact ? 1 : -1;
      if (a.followUp.lastContactAtValue === b.followUp.lastContactAtValue) return label(a).localeCompare(label(b), "fr");
      return lastContactSort === "oldest_first" ? a.followUp.lastContactAtValue - b.followUp.lastContactAtValue : b.followUp.lastContactAtValue - a.followUp.lastContactAtValue;
    });
  }, [base, lastContactSort, pushFilter]);

  const visibleIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const selectedIds = useMemo(() => visibleIds.filter((id) => selection.has(id)), [selection, visibleIds]);
  const selectedPlayers = useMemo(() => filtered.filter((p) => selection.has(p.id)), [filtered, selection]);
  const allVisibleSelected = visibleIds.length > 0 && selectedIds.length === visibleIds.length;
  useEffect(() => { setSelection((cur) => { const next = new Set([...cur].filter((id) => visibleIds.includes(id))); return next.size === cur.size ? cur : next; }); }, [visibleIds]);
  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = selectedIds.length > 0 && !allVisibleSelected;
  }, [allVisibleSelected, selectedIds.length]);

  const overview = useMemo(() => {
    const total = filtered.length;
    const active = filtered.filter((p) => p.assiduityLabel === "Tres actif" || p.assiduityLabel === "Actif").length;
    const relaunchCount = filtered.filter((p) => p.assiduityLabel === "A relancer").length;
    const inactive = filtered.filter((p) => p.assiduityLabel === "Inactif" || p.assiduityLabel === "Jamais actif").length;
    return { total, active, relaunchCount, inactive };
  }, [filtered]);

  const usageAnalytics = useMemo(() => {
    const dayStart = startOfLocalDay(Date.now()).getTime();
    const playersWithRemainingPart = players.filter((player) => player.remainingPart !== null);
    const activePlayers = players.filter((player) => isActiveForUsage(player) && player.remainingPart !== null);
    const exhaustedCount = playersWithRemainingPart.filter((player) => player.remainingPart === 0).length;
    const playedAtLeastOnceCount = playersWithRemainingPart.filter((player) => (player.remainingPart ?? 3) < 3).length;
    const notPlayedTodayCount = playersWithRemainingPart.filter((player) => player.remainingPart === 3 && player.lastRealActivityValue < dayStart).length;
    const averagePlayedToday = activePlayers.length > 0 ? activePlayers.reduce((total, player) => total + Math.max(0, 3 - (player.remainingPart ?? 3)), 0) / activePlayers.length : 0;
    const exhaustedSeries = buildLastThirtyDaysSeries(players.map((player) => ({ timestamp: player.partLastUpdateValue, include: player.partLastUpdateValue > 0 && player.remainingPart === 0 })));
    const signupsSeries = buildLastThirtyDaysSeries(players.map((player) => ({ timestamp: player.createdAtValue, include: player.createdAtValue > 0 })));

    return {
      exhaustedCount,
      playedAtLeastOnceCount,
      notPlayedTodayCount,
      averagePlayedToday,
      exhaustedSeries: exhaustedSeries.series,
      exhaustedHasEnoughData: exhaustedSeries.populatedDayCount >= 7,
      signupsSeries: signupsSeries.series,
      signupsHasEnoughData: signupsSeries.populatedDayCount >= 7,
    };
  }, [players]);

  useEffect(() => () => {
    exhaustedChartRef.current?.destroy();
    signupsChartRef.current?.destroy();
  }, []);

  useEffect(() => {
    if (!chartJsReady || !window.Chart || !exhaustedChartCanvasRef.current || !usageAnalytics.exhaustedHasEnoughData) {
      exhaustedChartRef.current?.destroy();
      exhaustedChartRef.current = null;
      return;
    }

    exhaustedChartRef.current?.destroy();
    const context = exhaustedChartCanvasRef.current.getContext("2d");
    if (!context) return;

    const gradient = context.createLinearGradient(0, 0, 0, chartHeight);
    gradient.addColorStop(0, "rgba(234, 243, 222, 0.3)");
    gradient.addColorStop(1, "rgba(234, 243, 222, 0)");

    exhaustedChartRef.current = new window.Chart(context, {
      type: "line",
      data: {
        labels: usageAnalytics.exhaustedSeries.map((point) => point.label),
        datasets: [{ data: usageAnalytics.exhaustedSeries.map((point) => point.value), borderColor: "#639922", backgroundColor: gradient, fill: true, tension: 0.28, borderWidth: 2, pointRadius: 2, pointHoverRadius: 3 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { displayColors: false, callbacks: { label: (context) => `${context.parsed.y} joueur${context.parsed.y > 1 ? "s" : ""}` } },
        },
        scales: {
          x: { grid: { display: false, drawBorder: false }, ticks: { color: "#999999", font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { precision: 0, color: "#999999", font: { size: 10 } }, grid: { color: "#F0F0EC", drawBorder: false } },
        },
      },
    });
  }, [chartJsReady, usageAnalytics.exhaustedHasEnoughData, usageAnalytics.exhaustedSeries]);

  useEffect(() => {
    if (!chartJsReady || !window.Chart || !signupsChartCanvasRef.current || !usageAnalytics.signupsHasEnoughData) {
      signupsChartRef.current?.destroy();
      signupsChartRef.current = null;
      return;
    }

    signupsChartRef.current?.destroy();
    const context = signupsChartCanvasRef.current.getContext("2d");
    if (!context) return;

    signupsChartRef.current = new window.Chart(context, {
      type: "bar",
      data: {
        labels: usageAnalytics.signupsSeries.map((point) => point.label),
        datasets: [{ data: usageAnalytics.signupsSeries.map((point) => point.value), backgroundColor: "#378ADD", borderRadius: 6, maxBarThickness: 18 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { displayColors: false, callbacks: { label: (context) => `${context.parsed.y} inscription${context.parsed.y > 1 ? "s" : ""}` } },
        },
        scales: {
          x: { grid: { display: false, drawBorder: false }, ticks: { color: "#999999", font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { precision: 0, color: "#999999", font: { size: 10 } }, grid: { color: "#F0F0EC", drawBorder: false } },
        },
      },
    });
  }, [chartJsReady, usageAnalytics.signupsHasEnoughData, usageAnalytics.signupsSeries]);

  const exportCsv = (rows: AdminPlayerListItem[], filename: string) => {
    const csv = [["Joueur","Email","Ville","Parties","Gains","Activite","Push"], ...rows.map((p) => [label(p), p.email, p.city, String(p.gamesPlayedCount ?? 0), String(p.winsCount ?? 0), p.assiduityLabel, p.pushStatus])].map((r) => r.map((c) => `"${c.replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const platformBadge = (platform: "iOS" | "Android" | "Inconnue") =>
    platform === "iOS"
      ? "bg-[#E6F1FB] text-[#185FA5]"
      : platform === "Android"
        ? "bg-[#EAF3DE] text-[#3B6D11]"
        : "bg-[#F7F7F5] text-[#666666]";

  const openBulkPushModal = (userIds: string[]) => {
    if (userIds.length === 0) {
      setFeedback({ tone: "error", text: "Sélectionne au moins un joueur avant l’envoi." });
      return;
    }

    setFeedback(null);
    setPushConfirming(false);
    setPushTestMode(false);
    setPushTestIds(new Set());
    setPushTestSearch("");
    setPushScheduleMode("now");
    setPushScheduleLocal("");
    setPushConfirmedScheduleMs(null);
    setPushModal(getBulkPushModalState(userIds));
  };

  const closePushModal = () => {
    if (pushSubmitting) return;
    setPushModal({
      open: false,
      userIds: [],
      title: "",
      message: "",
      heading: "",
      description: "",
    });
  };

  const submitPushNotification = () => {
    if (pushSendingRef.current || pushSubmitting) return;
    void (async () => {
      const title = pushModal.title.trim();
      const message = pushModal.message.trim();
      const user = auth.currentUser;
      const userIds = [...new Set(pushModal.userIds.map((id) => id.trim()).filter(Boolean))];
      const targetIds = pushTestMode
        ? userIds.filter((id) => pushTestIds.has(id)) : userIds;

      if (!title || !message) {
        setFeedback({ tone: "error", text: "Titre et message sont obligatoires." });
        return;
      }

      if (!user) {
        setFeedback({ tone: "error", text: "Connexion requise pour envoyer une notification." });
        return;
      }

      if (userIds.length === 0) {
        setFeedback({ tone: "error", text: "Aucun joueur cible pour cette notification." });
        return;
      }

      if (pushTestMode && (targetIds.length < 1 || targetIds.length > 5)) {
        setFeedback({ tone: "error", text: "Choisis entre 1 et 5 joueurs pour le mode test." });
        return;
      }

      let batches;
      let scheduledTimeMs: number | undefined;
      try {
        batches = buildPlayerPushBatches(targetIds);
        scheduledTimeMs = resolvePlayerPushScheduledTime(pushScheduleMode, pushScheduleLocal);
      } catch (error) {
        setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Sélection invalide." });
        return;
      }

      if (!pushConfirming) {
        setPushConfirmedScheduleMs(scheduledTimeMs ?? null);
        setPushConfirming(true);
        setFeedback(null);
        return;
      }

      pushSendingRef.current = true;
      setPushSubmitting(true);
      setFeedback(null);

      try {
        setPushCampaignReport({
            title, totalPlayers: targetIds.length, totalBatches: batches.length,
            testMode: pushTestMode, startedAt: new Date().toISOString(), scheduledTimeMs: scheduledTimeMs ?? null,
            batches, results: [],
          });
        await runPlayerPushBatches(
            batches,
            (userRefs) => createAdminPlayerPushBatch(title, message, userRefs, scheduledTimeMs),
            (result) => setPushCampaignReport((current) => current
              ? { ...current, results: [...current.results, result] } : current),
        );

        setFeedback({
          tone: "success",
          text: "Traitement des lots terminé. Vérifie le résultat de chaque lot ci-dessous ; « créé » ne confirme pas l’envoi FCM.",
        });
        setPushModal({
          open: false,
          userIds: [],
          title: "",
          message: "",
          heading: "",
          description: "",
        });
        setSelection(new Set());
        setPushConfirming(false);
      } catch (e) {
        console.error(e);
        const messageText = e instanceof Error ? e.message : "Impossible de créer la notification push.";
        setFeedback({ tone: "error", text: messageText });
      } finally {
        pushSendingRef.current = false;
        setPushSubmitting(false);
      }
    })();
  };

  return (
    <section className="space-y-4 bg-[#F7F7F5] text-[#1A1A1A]">
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"
        strategy="afterInteractive"
        onLoad={() => setChartJsReady(true)}
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1A1A1A]">Joueurs</h1>
          <p className="mt-2 text-[13px] text-[#666666]">{formatCount(players.length)} joueurs · suivi, contact et actions support</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => exportCsv(filtered, "proxiplay-joueurs.csv")} className="rounded-[10px] border border-[#E0E0DA] bg-white px-4 py-[10px] text-[12px] text-[#1A1A1A] transition hover:bg-[#FAFAF8]">Exporter CSV</button>
          <button type="button" onClick={() => openBulkPushModal(selectedPlayers.length > 0 ? selectedPlayers.map((player) => player.id) : filtered.map((player) => player.id))} disabled={pushSubmitting} className="rounded-[10px] border border-[#639922] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#57881D]">{pushSubmitting ? "Création..." : "Notif push"}</button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[{ label: "Joueurs visibles", value: fmt(overview.total), helper: "Total base", helperColor: "#999999", accent: "#E8E8E4", critical: false }, { label: "Actifs", value: fmt(overview.active), helper: `${formatPercent(overview.total ? (overview.active / overview.total) * 100 : 0)} de la base`, helperColor: "#3B6D11", accent: "#639922", critical: false }, { label: "A relancer", value: fmt(overview.relaunchCount), helper: `${formatPercent(overview.total ? (overview.relaunchCount / overview.total) * 100 : 0)} a recontacter`, helperColor: "#633806", accent: "#EF9F27", critical: false }, { label: "Inactifs", value: fmt(overview.inactive), helper: `${formatPercent(overview.total ? (overview.inactive / overview.total) * 100 : 0)} — a reactiver`, helperColor: "#A32D2D", accent: "#E24B4A", critical: true }].map((card) => <article key={card.label} className="overflow-hidden rounded-[10px] border border-[#E8E8E4] bg-white"><div className="h-[3px]" style={{ backgroundColor: card.accent }} /><div className="space-y-2 px-5 py-4"><p className="text-[11px] text-[#999999]">{card.label}</p><strong className="block text-[26px] font-medium leading-none" style={{ color: card.critical ? "#A32D2D" : "#1A1A1A" }}>{card.value}</strong><p className="text-[11px]" style={{ color: card.helperColor }}>{card.helper}</p></div></article>)}
      </div>

      <section className="rounded-[12px] bg-white p-4" style={analyticsCardStyle}>
        <div className="space-y-1">
          <h2 className="text-[13px] font-medium text-[#1A1A1A]">Utilisation des parties - aujourd&apos;hui</h2>
          <p className="text-[11px] text-[#999999]">Calcul temps reel cote client a partir des documents users deja charges en memoire.</p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[{ label: "Joueurs ayant utilise les 3 parties", value: fmt(usageAnalytics.exhaustedCount), helper: "remaining_part = 0", accent: "#E24B4A" }, { label: "Joueurs ayant joue au moins 1 fois", value: fmt(usageAnalytics.playedAtLeastOnceCount), helper: "remaining_part < 3", accent: "#639922" }, { label: "Joueurs n'ayant pas encore joue aujourd'hui", value: fmt(usageAnalytics.notPlayedTodayCount), helper: "remaining_part = 3 et activite avant le debut du jour", accent: "#EF9F27" }, { label: "Moyenne parties jouees aujourd'hui", value: formatAveragePlayed(usageAnalytics.averagePlayedToday), helper: "Moyenne sur les joueurs actifs", accent: "#378ADD" }].map((card) => <article key={card.label} className="overflow-hidden rounded-[12px] bg-white" style={analyticsCardStyle}><div className="h-[3px]" style={{ backgroundColor: card.accent }} /><div className="space-y-2 p-4"><p className="text-[11px] text-[#999999]">{card.label}</p><strong className="block text-[24px] font-medium leading-none text-[#1A1A1A]">{card.value}</strong><p className="text-[11px]" style={{ color: card.accent }}>{card.helper}</p></div></article>)}
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <article className="rounded-[12px] bg-white p-4" style={analyticsCardStyle}>
            <div className="space-y-1">
              <h3 className="text-[13px] font-medium text-[#1A1A1A]">Joueurs ayant epuise leurs 3 parties - 30 derniers jours (approximation)</h3>
              <p className="text-[11px] text-[#999999]">Approximation basee sur part_last_update et l&apos;etat actuel remaining_part, pas sur un historique exhaustif.</p>
            </div>
            <div className="mt-4" style={{ height: chartHeight }}>
              {usageAnalytics.exhaustedHasEnoughData ? <canvas ref={exhaustedChartCanvasRef} aria-label="Evolution des joueurs ayant epuise leurs parties" /> : <AnalyticsChartFallback message="Moins de 7 jours de donnees exploitables pour afficher une tendance fiable." />}
            </div>
          </article>

          <article className="rounded-[12px] bg-white p-4" style={analyticsCardStyle}>
            <div className="space-y-1">
              <h3 className="text-[13px] font-medium text-[#1A1A1A]">Nouvelles inscriptions - 30 derniers jours</h3>
              <p className="text-[11px] text-[#999999]">Base sur created_time des utilisateurs deja charges sur la page.</p>
            </div>
            <div className="mt-4" style={{ height: chartHeight }}>
              {usageAnalytics.signupsHasEnoughData ? <canvas ref={signupsChartCanvasRef} aria-label="Nouvelles inscriptions sur 30 jours" /> : <AnalyticsChartFallback message="Moins de 7 jours de donnees exploitables pour afficher l'acquisition recente." />}
            </div>
          </article>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-[10px] border border-[#E8E8E4] bg-white p-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-2">{[{ value: "tous", label: "Tous" }, { value: "actif", label: "Actifs" }, { value: "inactif", label: "Inactifs" }].map((item) => <button key={item.value} type="button" onClick={() => setActivityFilter(item.value as ActivityFilter)} className={`rounded-full px-3 py-[8px] text-[12px] transition ${activityFilter === item.value ? "bg-[#EAF3DE] font-medium text-[#3B6D11]" : "text-[#666666] hover:bg-[#F7F7F5]"}`}>{item.label}</button>)}</div>
        <div className="hidden h-6 w-px bg-[#F0F0EC] lg:block" />
        <select value={pushFilter} onChange={(e) => setPushFilter(e.target.value as "tous" | "actif" | "inconnu")} className="h-[40px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[12.5px] text-[#1A1A1A] outline-none"><option value="tous">Push : Tous</option><option value="actif">Push : Active</option><option value="inconnu">Push : Desactive</option></select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-[40px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[12.5px] text-[#1A1A1A] outline-none"><option value="tous">Statut joueur : Tous</option>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select value={followUpFilter} onChange={(e) => setFollowUpFilter(e.target.value as FollowUpFilter)} className="h-[40px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[12.5px] text-[#1A1A1A] outline-none"><option value="tous">Suivi : Tous</option><option value="a_faire">A faire</option><option value="relance">Relance</option><option value="sans_reponse">Sans reponse</option><option value="ok">OK</option></select>
        <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="h-[40px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[12.5px] text-[#1A1A1A] outline-none"><option value="toutes">Ville : Toutes</option>{cities.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
        <div className="hidden h-6 w-px bg-[#F0F0EC] lg:block" />
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, email ou ville..." className="h-[40px] flex-1 rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[12.5px] text-[#1A1A1A] outline-none placeholder:text-[#999999]" />
        <div className="text-[12px] text-[#999999]">{pendingPush.length > 0 && pushFilter !== "tous" ? "Verification..." : `${fmt(filtered.length)} joueurs affiches`}</div>
      </div>

      {error ? <div className="rounded-[12px] border border-[#F2CACA] bg-[#FCEBEB] px-5 py-4 text-[12.5px] text-[#A32D2D]">{error}</div> : null}
      {feedback ? <div className={`rounded-[12px] border px-5 py-4 text-[12.5px] ${feedback.tone === "success" ? "border-[#C0DD97] bg-[#EAF3DE] text-[#3B6D11]" : "border-[#F2CACA] bg-[#FCEBEB] text-[#A32D2D]"}`}>{feedback.text}</div> : null}

      <section className="overflow-hidden rounded-[12px] border border-[#E8E8E4] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#F0F0EC] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-[15px] font-medium text-[#1A1A1A]">Liste des joueurs</h2>
          
        </div>

        {selectedIds.length > 0 ? <div className="flex flex-col gap-3 border-b border-[#C0DD97] bg-[#EAF3DE] px-5 py-4 lg:flex-row lg:items-center lg:justify-between"><span className="text-[12.5px] font-medium text-[#3B6D11]">{selectedIds.length} joueurs selectionnes</span><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => openBulkPushModal(selectedIds)} disabled={pushSubmitting} className="rounded-[8px] bg-[#639922] px-3 py-[9px] text-[12px] font-medium text-white transition hover:bg-[#57881D] disabled:opacity-50">Envoyer une notif push</button><button type="button" onClick={() => setSelection(new Set())} className="rounded-[8px] border border-[#C0DD97] bg-white px-3 py-[9px] text-[12px] text-[#3B6D11] transition hover:bg-[#F7F7F5]">Deselectionner</button></div></div> : null}

        {loading ? <div className="px-5 py-10 text-[12.5px] text-[#999999]">Chargement des joueurs Firestore...</div> : filtered.length === 0 ? <div className="px-5 py-10 text-[12.5px] text-[#999999]">Aucun document users joueur ne correspond a la recherche ou aux filtres selectionnes.</div> : <div className="overflow-x-auto"><table className="min-w-full"><thead><tr className="border-b border-[#F0F0EC]"><th className={thClass}><input ref={selectAllRef} type="checkbox" checked={allVisibleSelected} onChange={() => setSelection((cur) => { const next = new Set(cur); if (allVisibleSelected) { visibleIds.forEach((id) => next.delete(id)); } else { visibleIds.forEach((id) => next.add(id)); } return next; })} aria-label="Tout selectionner" className="h-4 w-4 rounded-[3px] border border-[#D3D1C7]" /></th>{["Joueur", "Contact", "Performance", "Activite", "Actions"].map((headerLabel) => <th key={headerLabel} className={thClass}>{headerLabel}</th>)}</tr></thead><tbody>{filtered.map((p) => { const tone = activityColors(p); const platform: "iOS" | "Android" | "Inconnue" = "Inconnue"; return <tr key={p.id} className="cursor-pointer border-b border-[#F0F0EC] transition hover:bg-[#FAFAF8] last:border-b-0" onClick={() => router.push(`/admin/joueurs/${p.id}`)}><td className="px-[14px] py-[10px]"><button type="button" onClick={(event) => { event.stopPropagation(); setSelection((cur) => { const next = new Set(cur); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next; }); }} aria-label={`Selectionner ${label(p)}`} className={`flex h-[14px] w-[14px] items-center justify-center rounded-[3px] border ${selection.has(p.id) ? "border-[#639922] bg-[#EAF3DE]" : "border-[#D3D1C7] bg-white"}`}>{selection.has(p.id) ? <span className="h-[6px] w-[6px] rounded-[1px] bg-[#639922]" /> : null}</button></td><td className="px-[14px] py-[10px]"><div className="flex items-center gap-3"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium ${tone.avatar}`}>{initials(p)}</div><div><p className="text-[12.5px] font-medium text-[#1A1A1A]">{label(p)}</p><span className={`mt-1 inline-flex rounded-full px-2 py-[3px] text-[10px] ${platformBadge(platform)}`}>{platform}</span></div></div></td><td className="px-[14px] py-[10px]"><p className="max-w-[220px] truncate text-[11px] text-[#666666]">{p.email}</p><p className="mt-1 text-[11px] text-[#999999]">{p.city}</p></td><td className="px-[14px] py-[10px]"><p className="text-[12px] font-medium text-[#1A1A1A]">{fmt(p.gamesPlayedCount)} parties</p><p className="mt-1 text-[11px] font-medium text-[#639922]">{fmt(p.winsCount)} gains</p></td><td className="px-[14px] py-[10px]"><span className={`inline-flex rounded-full px-3 py-[4px] text-[11px] font-medium ${tone.badge}`}>{p.assiduityLabel}</span><p className="mt-2 text-[11px] text-[#999999]">{p.lastRealActivityLabel}</p></td><td className="px-[14px] py-[10px]"><div className="flex items-center gap-2">{(p.assiduityLabel === "A relancer" || p.assiduityLabel === "Inactif" || p.assiduityLabel === "Jamais actif") && p.email !== "Non renseigne" ? <a href={`mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent("Votre retour sur ProxiPlay")}`} onClick={(event) => event.stopPropagation()} className="rounded-[6px] bg-[#EAF3DE] px-2 py-[6px] text-[11px] font-medium text-[#3B6D11] transition hover:bg-[#DDEAC7]">Relance e-mail</a> : null}</div></td></tr>; })}</tbody></table></div>}
      </section>

      {pushCampaignReport ? (
        <section className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
          <h2 className="text-[16px] font-medium">Résultats de la campagne {pushCampaignReport.testMode ? "test" : "collective"}</h2>
          <p className="mt-1 text-[12px] text-[#666666]">{pushCampaignReport.title} · {pushCampaignReport.totalPlayers} joueurs · {pushCampaignReport.totalBatches} lots · {pushCampaignReport.scheduledTimeMs ? `Programmé le ${formatParisScheduledTime(pushCampaignReport.scheduledTimeMs)} (Paris)` : "Envoi immédiat"} · Créé le {new Date(pushCampaignReport.startedAt).toLocaleString("fr-FR")}</p>
          <p className="mt-1 text-[11px] text-[#666666]">Ces résultats restent dans cet onglet après rechargement. « Créé » signifie que la demande existe, pas que FCM l’a acceptée.</p>
          <div className="mt-4 space-y-2">
            {(pushCampaignReport.batches ?? pushCampaignReport.results).map((batch) => {
              const result = pushCampaignReport.results.find((item) => item.number === batch.number);
              return <details key={batch.number} className="rounded-[8px] border border-[#E8E8E4] p-3">
                <summary className="cursor-pointer text-[12px] font-medium">
                  Lot {batch.number}/{pushCampaignReport.totalBatches} · {batch.uids.length} joueurs · {result ? result.status === "created" ? "Créé" : result.status === "error" ? "Erreur" : "Résultat incertain" : "Sans résultat enregistré"}
                  {result?.documentId ? " · Document : " + result.documentId : ""}
                </summary>
                {result?.message ? <p className="mt-2 text-[11px] text-[#A32D2D]">{result.message}</p> : null}
                <p className="mt-2 text-[11px] text-[#666666]">UID du lot pour vérification manuelle :</p>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[11px]">{batch.uids.join("\n")}</pre>
              </details>;
            })}
          </div>
        </section>
      ) : null}

      {pushModal.open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(26,26,26,0.28)] px-4">
          <div className="max-h-[90vh] w-full max-w-[580px] overflow-y-auto rounded-[14px] border border-[#E8E8E4] bg-white p-5 shadow-[0_24px_80px_rgba(26,26,26,0.16)]">
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="text-[16px] font-medium">{pushModal.heading}</h3><p className="mt-1 text-[12px] text-[#999999]">{pushModal.description}</p></div>
              <button type="button" onClick={closePushModal} disabled={pushSubmitting} className="text-[12px] text-[#666666] disabled:opacity-50">Fermer</button>
            </div>
            <div className="mt-4 grid gap-4">
              <label className="grid gap-2 text-[12px]">Titre
                <input type="text" maxLength={50} value={pushModal.title} disabled={pushSubmitting} onChange={(event) => { setPushConfirming(false); setPushModal((current) => ({ ...current, title: event.target.value })); }} className="h-[42px] rounded-[10px] border border-[#E8E8E4] px-3 text-[13px]" />
              </label>
              <label className="grid gap-2 text-[12px]">Message
                <textarea maxLength={150} rows={5} value={pushModal.message} disabled={pushSubmitting} onChange={(event) => { setPushConfirming(false); setPushModal((current) => ({ ...current, message: event.target.value })); }} className="rounded-[10px] border border-[#E8E8E4] px-3 py-3 text-[13px]" />
              </label>
              <fieldset className="rounded-[10px] border border-[#E8E8E4] p-3 text-[12px]">
                <legend className="px-1 font-medium">Quand envoyer ?</legend>
                <div className="flex gap-5">
                  <label className="flex items-center gap-2"><input type="radio" name="player-push-schedule" checked={pushScheduleMode === "now"} disabled={pushSubmitting} onChange={() => { setPushScheduleMode("now"); setPushConfirming(false); }} />Envoyer maintenant</label>
                  <label className="flex items-center gap-2 text-[#999999]"><input type="radio" name="player-push-schedule" checked={pushScheduleMode === "later"} disabled={pushSubmitting || !PLAYER_PUSH_SCHEDULING_ENABLED} onChange={() => { setPushScheduleMode("later"); setPushConfirming(false); }} />Programmer</label>
                </div>
                {!PLAYER_PUSH_SCHEDULING_ENABLED ? <p className="mt-2 text-[11px] text-[#A32D2D]">Programmation indisponible : correction des fonctions en attente.</p> : null}
                {pushScheduleMode === "later" ? <label className="mt-3 grid gap-1">Date et heure à Paris (minimum 2 minutes dans le futur)
                  <input type="datetime-local" value={pushScheduleLocal} disabled={pushSubmitting} onChange={(event) => { setPushScheduleLocal(event.target.value); setPushConfirming(false); }} className="rounded-[8px] border border-[#E8E8E4] px-3 py-2" />
                </label> : null}
                {pushScheduleMode === "later" ? <p className="mt-2 text-[11px] text-[#A32D2D]">Le traitement des notifications programmées doit être validé sur un seul compte avant toute campagne collective.</p> : null}
              </fieldset>
              <div className="rounded-[10px] border border-[#E8E8E4] p-3">
                  <label className="flex items-center gap-2 text-[12px] font-medium">
                    <input type="checkbox" checked={pushTestMode} disabled={pushSubmitting} onChange={(event) => { setPushTestMode(event.target.checked); setPushTestIds(new Set()); setPushConfirming(false); }} />
                    Mode test : choisir 1 à 5 joueurs parmi les joueurs ciblés
                  </label>
                  {pushTestMode ? <p className="mt-2 text-[11px] text-[#A32D2D]">Le mode test crée de vraies demandes push pour les joueurs choisis.</p> : null}
                  {pushTestMode ? (
                    <div className="mt-3">
                      <input type="search" value={pushTestSearch} disabled={pushSubmitting} onChange={(event) => setPushTestSearch(event.target.value)} placeholder="Rechercher un nom ou un UID" className="w-full rounded-[8px] border border-[#E8E8E4] px-3 py-2 text-[12px]" />
                      <p className="mt-2 text-[11px] text-[#666666]">{pushTestIds.size}/5 joueurs choisis</p>
                      <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                        {pushModal.userIds.filter((id) => {
                          const player = players.find((item) => item.id === id);
                          return (id + " " + (player ? label(player) : "")).toLowerCase().includes(pushTestSearch.toLowerCase());
                        }).slice(0, 50).map((id) => {
                          const player = players.find((item) => item.id === id);
                          return <label key={id} className="flex gap-2 text-[11px]">
                            <input type="checkbox" checked={pushTestIds.has(id)} disabled={pushSubmitting || (pushTestIds.size >= 5 && !pushTestIds.has(id))} onChange={() => { setPushConfirming(false); setPushTestIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }} />
                            <span>{player ? label(player) : id} · {id}</span>
                          </label>;
                        })}
                      </div>
                    </div>
                  ) : null}
              </div>
              {pushConfirming ? (
                <div className="rounded-[10px] border border-[#C0DD97] bg-[#EAF3DE] p-3 text-[12px]">
                  Confirmer la création de notifications pour {pushTestMode ? pushTestIds.size : pushModal.userIds.length} joueur(s), en {Math.ceil((pushTestMode ? pushTestIds.size : pushModal.userIds.length) / 50)} lot(s), {pushConfirmedScheduleMs !== null ? `programmés le ${formatParisScheduledTime(pushConfirmedScheduleMs)} (Paris)` : "à envoyer maintenant"} ? Aucun lot ne sera relancé automatiquement.
                </div>
              ) : null}
              {feedback?.tone === "error" ? <p className="text-[12px] text-[#A32D2D]">{feedback.text}</p> : null}
              {pushSubmitting && pushCampaignReport ? (
                <div className="text-[12px]">
                  <p>Lots traités : {pushCampaignReport.results.length}/{pushCampaignReport.totalBatches}. Ne ferme pas cet onglet.</p>
                  <ul className="mt-2 max-h-24 overflow-y-auto">
                    {pushCampaignReport.results.map((result) => <li key={result.number}>Lot {result.number} : {result.status === "created" ? "créé · " + result.documentId : result.status === "error" ? "erreur" : "résultat incertain"}</li>)}
                  </ul>
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={closePushModal} disabled={pushSubmitting} className="rounded-[10px] border border-[#E8E8E4] px-4 py-[10px] text-[12px] disabled:opacity-50">Annuler</button>
                <button type="button" onClick={submitPushNotification} disabled={pushSubmitting} className="rounded-[10px] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white disabled:opacity-50">{pushSubmitting ? "Création des lots..." : pushConfirming ? "Confirmer et lancer" : "Vérifier avant lancement"}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
