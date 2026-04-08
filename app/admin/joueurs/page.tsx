"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getAdminFollowUpErrorMessage,
  markPlayerAsContactedAction,
  markPlayersAsContactedAction,
} from "@/lib/firebase/adminActions";
import {
  getPlayersList,
  getPlayersPushStatuses,
  type AdminPlayerListItem,
} from "@/lib/firebase/adminQueries";
import { buildWhatsAppLink } from "@/lib/firebase/merchantsQueries";

type FollowUpFilter = "tous" | "a_faire" | "relance" | "sans_reponse" | "ok";
type ActivityFilter = "tous" | "actif" | "inactif";
type LastContactSort = "recent_first" | "oldest_first" | "never_first";
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
function relaunch(p: AdminPlayerListItem) {
  if (p.phone !== "Non renseigne" && p.phone.trim()) return { href: buildWhatsAppLink(p.phone, label(p)), channel: "phone" as const, disabled: false };
  if (p.email !== "Non renseigne" && p.email.trim()) return { href: `mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent(`Relance ProxiPlay - ${label(p)}`)}`, channel: "email" as const, disabled: false };
  return { href: null, channel: "unknown" as const, disabled: true };
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
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [chartJsReady, setChartJsReady] = useState(false);
  const exhaustedChartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signupsChartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const exhaustedChartRef = useRef<AnalyticsChartInstance | null>(null);
  const signupsChartRef = useRef<AnalyticsChartInstance | null>(null);

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

  const bulkNotify = (source: AdminPlayerListItem[] = selectedPlayers) => {
    void (async () => {
      const contactable = source.filter((p) => p.email.trim() && p.email !== "Non renseigne");
      const emails = [...new Set(contactable.map((p) => p.email.trim()))];
      if (emails.length === 0) { setFeedback("Aucun email exploitable dans la selection visible."); return; }
      setBulkLoading(true); setFeedback(null);
      try {
        await markPlayersAsContactedAction({ userIds: contactable.map((p) => p.id), lastContactChannel: "email" });
        const now = Date.now();
        const nowLabel = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(now));
        setPlayers((cur) => cur.map((p) => contactable.some((c) => c.id === p.id) ? { ...p, followUp: { ...p.followUp, lastContactAtLabel: nowLabel, lastContactAtValue: now, lastContactChannel: "email", followUpStatus: "relance", hasLastContact: true } } : p));
        const subject = encodeURIComponent("Relance ProxiPlay");
        const body = encodeURIComponent("Bonjour,\n\nJe reviens vers vous au sujet de votre activite ProxiPlay.\n\nBien a vous,\nL equipe ProxiPlay");
        window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${subject}&body=${body}`;
        setFeedback(`${emails.length} adresse(s) email preparee(s) et marquee(s) comme relancees.`);
      } catch (e) {
        console.error(e); setFeedback(getAdminFollowUpErrorMessage(e));
      } finally { setBulkLoading(false); }
    })();
  };

  const oneNotify = (p: AdminPlayerListItem) => {
    const action = relaunch(p);
    if (action.disabled || !action.href) { setFeedback("Aucun canal de relance exploitable pour ce joueur."); return; }
    void (async () => {
      setPendingId(p.id); setFeedback(null);
      try {
        await markPlayerAsContactedAction({ userId: p.id, lastContactChannel: action.channel });
        const now = Date.now();
        const nowLabel = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(now));
        setPlayers((cur) => cur.map((x) => x.id === p.id ? { ...x, followUp: { ...x.followUp, lastContactAtLabel: nowLabel, lastContactAtValue: now, lastContactChannel: action.channel, followUpStatus: "relance", hasLastContact: true } } : x));
        const href = action.href;
        if (!href) {
          setFeedback("Aucun canal de relance exploitable pour ce joueur.");
          return;
        }
        window.location.href = href;
        setFeedback(`Relance joueur preparee et suivi mis a jour via ${action.channel === "email" ? "email" : "WhatsApp"}.`);
      } catch (e) {
        console.error(e); setFeedback(getAdminFollowUpErrorMessage(e));
      } finally { setPendingId(null); }
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
          <button type="button" onClick={() => bulkNotify(selectedPlayers.length > 0 ? selectedPlayers : filtered)} disabled={bulkLoading} className="rounded-[10px] border border-[#639922] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#57881D]">{bulkLoading ? "Preparation..." : "Envoyer une notif"}</button>
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
      {feedback ? <div className="rounded-[12px] border border-[#E8E8E4] bg-white px-5 py-4 text-[12.5px] text-[#666666]">{feedback}</div> : null}

      <section className="overflow-hidden rounded-[12px] border border-[#E8E8E4] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#F0F0EC] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-[15px] font-medium text-[#1A1A1A]">Liste des joueurs</h2>
          {selectedIds.length > 0 ? <div className="flex flex-wrap items-center gap-2"><span className="text-[12px] text-[#999999]">{selectedIds.length} selectionnes</span><button type="button" onClick={() => bulkNotify(selectedPlayers)} disabled={bulkLoading} className="rounded-[8px] bg-[#639922] px-3 py-[9px] text-[12px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#57881D]">Envoyer notif</button><button type="button" onClick={() => exportCsv(selectedPlayers, "proxiplay-joueurs-selection.csv")} className="rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-[9px] text-[12px] text-[#666666] transition hover:bg-[#EFEDE6]">Exporter</button></div> : null}
        </div>

        {loading ? <div className="px-5 py-10 text-[12.5px] text-[#999999]">Chargement des joueurs Firestore...</div> : filtered.length === 0 ? <div className="px-5 py-10 text-[12.5px] text-[#999999]">Aucun document users joueur ne correspond a la recherche ou aux filtres selectionnes.</div> : <div className="overflow-x-auto"><table className="min-w-full"><thead><tr className="border-b border-[#F0F0EC]">{["", "Joueur", "Contact", "Performance", "Activite", "Actions"].map((label) => <th key={label} className={thClass}>{label}</th>)}</tr></thead><tbody>{filtered.map((p) => { const action = relaunch(p); const tone = activityColors(p); const platform: "iOS" | "Android" | "Inconnue" = "Inconnue"; return <tr key={p.id} className="border-b border-[#F0F0EC] hover:bg-[#FAFAF8] last:border-b-0"><td className="px-[14px] py-[10px]"><button type="button" onClick={() => setSelection((cur) => { const next = new Set(cur); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next; })} aria-label={`Selectionner ${label(p)}`} className={`flex h-[14px] w-[14px] items-center justify-center rounded-[3px] border ${selection.has(p.id) ? "border-[#639922] bg-[#EAF3DE]" : "border-[#D3D1C7] bg-white"}`}>{selection.has(p.id) ? <span className="h-[6px] w-[6px] rounded-[1px] bg-[#639922]" /> : null}</button></td><td className="px-[14px] py-[10px]"><div className="flex items-center gap-3"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium ${tone.avatar}`}>{initials(p)}</div><div><p className="text-[12.5px] font-medium text-[#1A1A1A]">{label(p)}</p><span className={`mt-1 inline-flex rounded-full px-2 py-[3px] text-[10px] ${platformBadge(platform)}`}>{platform}</span></div></div></td><td className="px-[14px] py-[10px]"><p className="max-w-[220px] truncate text-[11px] text-[#666666]">{p.email}</p><p className="mt-1 text-[11px] text-[#999999]">{p.city}</p></td><td className="px-[14px] py-[10px]"><p className="text-[12px] font-medium text-[#1A1A1A]">{fmt(p.gamesPlayedCount)} parties</p><p className="mt-1 text-[11px] font-medium text-[#639922]">{fmt(p.winsCount)} gains</p></td><td className="px-[14px] py-[10px]"><span className={`inline-flex rounded-full px-3 py-[4px] text-[11px] font-medium ${tone.badge}`}>{p.assiduityLabel}</span><p className="mt-2 text-[11px] text-[#999999]">{p.lastRealActivityLabel}</p></td><td className="px-[14px] py-[10px]"><div className="flex items-center gap-2">{(p.assiduityLabel === "A relancer" || p.assiduityLabel === "Inactif" || p.assiduityLabel === "Jamais actif") && !action.disabled && action.href ? <button type="button" disabled={pendingId === p.id} onClick={() => oneNotify(p)} className="rounded-[6px] bg-[#EAF3DE] px-2 py-[6px] text-[11px] font-medium text-[#3B6D11] transition hover:bg-[#DDEAC7] disabled:cursor-not-allowed disabled:opacity-50">{pendingId === p.id ? "Mise a jour..." : "Relancer"}</button> : null}<Link href={`/admin/joueurs/${p.id}`} className="text-[11px] text-[#639922]">Voir →</Link></div></td></tr>; })}</tbody></table></div>}
      </section>
    </section>
  );
}
