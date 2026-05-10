"use client";

import { collectionGroup, getDocs, limit, orderBy, query, Timestamp, where, type DocumentReference } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { useRef } from "react";
import {
  getMerchantsList,
  getPlayersList,
  type AdminMerchantListItem,
  type AdminPlayerListItem,
} from "@/lib/firebase/adminQueries";
import { db } from "@/lib/firebase/client-app";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
type ActivityTab = "kpi" | "players" | "merchants" | "segments";
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
type FirestoreParticipantDocument = {
  participation_date?: Timestamp;
  user_id?: DocumentReference | string | null;
};

declare global {
  interface Window {
    Chart?: AnalyticsChartConstructor;
  }
}

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function isWithinDays(timestamp: number, days: number) {
  return timestamp > 0 && Date.now() - timestamp <= days * DAY_IN_MS;
}

function getPlayerLabel(player: AdminPlayerListItem) {
  if (player.fullName !== "Non renseigne") {
    return player.fullName;
  }

  if (player.pseudo !== "Non renseigne") {
    return player.pseudo;
  }

  return player.email;
}

function getUpdatedLabel() {
  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return `Mis a jour aujourd'hui · ${dateLabel}`;
}

function getRetentionTone(value: number) {
  if (value < 25) {
    return {
      bg: "#FCEBEB",
      text: "#A32D2D",
    };
  }

  if (value <= 50) {
    return {
      bg: "#FAEEDA",
      text: "#633806",
    };
  }

  return {
    bg: "#EAF3DE",
    text: "#3B6D11",
  };
}

type MetricCardProps = {
  accent: string;
  label: string;
  value: string;
  trend: string;
  trendColor: string;
  description: string;
  critical?: boolean;
};

function MetricCard({
  accent,
  label,
  value,
  trend,
  trendColor,
  description,
  critical = false,
}: MetricCardProps) {
  return (
    <article className="relative rounded-[10px] border border-[#E8E8E4] bg-white p-[14px]">
      <div
        className="absolute inset-x-0 top-0 h-[3px] rounded-t-[10px]"
        style={{ backgroundColor: accent }}
      />
      <div className="space-y-2 pt-1">
        <p className="text-[11px] text-[#999999]">{label}</p>
        <strong
          className="block text-[26px] font-medium leading-none"
          style={{ color: critical ? "#A32D2D" : "#1A1A1A" }}
        >
          {value}
        </strong>
        <p className="text-[11px]" style={{ color: trendColor }}>
          {trend}
        </p>
        <p className="text-[11px] leading-[1.4] text-[#BBBBBB]">{description}</p>
      </div>
    </article>
  );
}

export default function AdminActivityPage() {
  const [activeTab, setActiveTab] = useState<ActivityTab>("kpi");
  const [players, setPlayers] = useState<AdminPlayerListItem[]>([]);
  const [merchants, setMerchants] = useState<AdminMerchantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartJsReady, setChartJsReady] = useState(false);
  const [participants, setParticipants] = useState<FirestoreParticipantDocument[]>([]);
  const signupsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const uniqueDauCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signupsChartRef = useRef<AnalyticsChartInstance | null>(null);
  const uniqueDauChartRef = useRef<AnalyticsChartInstance | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadActivity = async () => {
      setLoading(true);
      setError(null);

      try {
        const [playerItems, merchantItems] = await Promise.all([
          getPlayersList(),
          getMerchantsList(),
        ]);

        let participantsSnap = { docs: [] as Array<{ data: () => unknown }> };
        try {
          const thirtyDaysAgo = Timestamp.fromMillis(Date.now() - 30 * DAY_IN_MS);
          participantsSnap = await getDocs(
            query(
              collectionGroup(db, "participants"),
              orderBy("participation_date", "desc"),
              where("participation_date", ">=", thirtyDaysAgo),
              limit(5000),
            ),
          );
        } catch (participantsError) {
          console.warn("Participants non charges:", participantsError);
        }

        if (!isCancelled) {
          setPlayers(playerItems);
          setMerchants(merchantItems);
          setParticipants(participantsSnap.docs.map((doc) => doc.data() as FirestoreParticipantDocument));
        }
      } catch (loadError) {
        console.error(loadError);

        if (!isCancelled) {
          setError("Impossible de charger les indicateurs d activite depuis Firestore.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadActivity();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (window.Chart) {
      setChartJsReady(true);
    }
  }, []);

  const playerMetrics = useMemo(() => {
    const counts = {
      active7Days: 0,
      active30Days: 0,
      new30Days: 0,
      toRelaunch: 0,
      inactive: 0,
      neverActive: 0,
      veryActive: 0,
      active: 0,
    };

    players.forEach((player) => {
      if (isWithinDays(player.lastRealActivityValue, 7)) {
        counts.active7Days += 1;
      }

      if (isWithinDays(player.lastRealActivityValue, 30)) {
        counts.active30Days += 1;
      }

      if (isWithinDays(player.createdAtValue, 30)) {
        counts.new30Days += 1;
      }

      if (player.assiduityLabel === "Tres actif") {
        counts.veryActive += 1;
      }

      if (player.assiduityLabel === "Actif") {
        counts.active += 1;
      }

      if (player.assiduityLabel === "A relancer") {
        counts.toRelaunch += 1;
      }

      if (player.assiduityLabel === "Jamais actif") {
        counts.neverActive += 1;
        counts.inactive += 1;
      }

      if (player.assiduityLabel === "Inactif") {
        counts.inactive += 1;
      }
    });

    return counts;
  }, [players]);

  const merchantMetrics = useMemo(() => {
    const counts = {
      registered: merchants.length,
      withGames: 0,
      withoutGames: 0,
      withParticipation: 0,
      withoutFirstParticipation: 0,
      recentlyLaunched: 0,
    };

    merchants.forEach((merchant) => {
      if (merchant.gamesCreatedCount > 0) {
        counts.withGames += 1;
      } else {
        counts.withoutGames += 1;
      }

      if (merchant.participationsCount > 0) {
        counts.withParticipation += 1;
      }

      if (merchant.gamesCreatedCount > 0 && merchant.participationsCount === 0) {
        counts.withoutFirstParticipation += 1;
      }

      if (isWithinDays(merchant.latestGameStartValue, 30)) {
        counts.recentlyLaunched += 1;
      }
    });

    return counts;
  }, [merchants]);

  const usefulSegments = useMemo(() => {
    const inactivePlayers = players
      .filter(
        (player) =>
          player.assiduityLabel === "Inactif" || player.assiduityLabel === "Jamais actif",
      )
      .slice(0, 4);
    const merchantsWithoutParticipation = merchants
      .filter((merchant) => merchant.gamesCreatedCount > 0 && merchant.participationsCount === 0)
      .slice(0, 4);

    return {
      inactivePlayers,
      merchantsWithoutParticipation,
    };
  }, [merchants, players]);

  const rates = useMemo(() => {
    const totalPlayers = Math.max(players.length, 1);
    const totalMerchants = Math.max(merchantMetrics.registered, 1);
    const newPlayers = players.filter((player) => isWithinDays(player.createdAtValue, 30));
    const retentionJ1Base = newPlayers.length || players.length;
    const retentionJ1Retained = newPlayers.filter((player) =>
      isWithinDays(player.lastRealActivityValue, 1),
    ).length;
    const retentionJ7Retained = players.filter((player) => isWithinDays(player.lastRealActivityValue, 7)).length;
    const retentionJ30Retained = players.filter((player) => isWithinDays(player.lastRealActivityValue, 30)).length;

    return {
      active7Pct: (playerMetrics.active7Days / totalPlayers) * 100,
      active30Pct: (playerMetrics.active30Days / totalPlayers) * 100,
      inactivePct: (playerMetrics.inactive / totalPlayers) * 100,
      merchantsWithGamesPct: (merchantMetrics.withGames / totalMerchants) * 100,
      merchantsWithParticipationPct: (merchantMetrics.withParticipation / totalMerchants) * 100,
      retentionJ0: 100,
      retentionJ1:
        retentionJ1Base > 0 ? (retentionJ1Retained / retentionJ1Base) * 100 : 0,
      retentionJ7: (retentionJ7Retained / totalPlayers) * 100,
      retentionJ30: (retentionJ30Retained / totalPlayers) * 100,
    };
  }, [merchantMetrics.registered, merchantMetrics.withGames, merchantMetrics.withParticipation, playerMetrics.active30Days, playerMetrics.active7Days, playerMetrics.inactive, players]);

  const chartSeries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysStart = new Date();
    thirtyDaysStart.setHours(0, 0, 0, 0);
    thirtyDaysStart.setDate(thirtyDaysStart.getDate() - 29);

    const signups = new Map<number, number>();

    for (let day = thirtyDaysStart.getTime(); day <= today.getTime(); day += DAY_IN_MS) {
      signups.set(day, 0);
    }

    players.forEach((player) => {
      if (player.createdAtValue > 0) {
        const signupDay = new Date(player.createdAtValue);
        signupDay.setHours(0, 0, 0, 0);
        if (signups.has(signupDay.getTime())) {
          signups.set(signupDay.getTime(), (signups.get(signupDay.getTime()) ?? 0) + 1);
        }
      }
    });

    const signupDays = [...signups.keys()].sort((left, right) => left - right);
    const signupLabels = signupDays.map((day) =>
      new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(new Date(day)),
    );

    if (participants.length === 0) {
      return {
        signupLabels,
        signups: signupDays.map((day) => signups.get(day) ?? 0),
        dauLabels: [],
        dauReel: [],
        dauDayCount: 0,
      };
    }

    let oldestParticipation = Date.now();
    participants.forEach((participant) => {
      const date = participant.participation_date?.toDate() ?? null;
      if (date && date.getTime() < oldestParticipation) {
        oldestParticipation = date.getTime();
      }
    });

    const startDau = new Date(oldestParticipation);
    startDau.setHours(0, 0, 0, 0);
    const dauByDay = new Map<number, Set<string>>();
    const dauDayCount = Math.ceil((today.getTime() - startDau.getTime()) / DAY_IN_MS) + 1;

    for (let day = startDau.getTime(); day <= today.getTime(); day += DAY_IN_MS) {
      dauByDay.set(day, new Set());
    }

    participants.forEach((participant) => {
      const date = participant.participation_date?.toDate() ?? null;
      const userId =
        typeof participant.user_id === "object" && participant.user_id?.id
          ? participant.user_id.id
          : typeof participant.user_id === "string"
            ? participant.user_id
            : null;

      if (!date || !userId) {
        return;
      }

      const day = new Date(date);
      day.setHours(0, 0, 0, 0);
      if (dauByDay.has(day.getTime())) {
        dauByDay.get(day.getTime())?.add(userId);
      }
    });

    const sortedDays = [...dauByDay.keys()].sort((left, right) => left - right);
    const dauLabels = sortedDays.map((day) =>
      new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(new Date(day)),
    );

    return {
      signupLabels,
      signups: signupDays.map((day) => signups.get(day) ?? 0),
      dauLabels,
      dauReel: sortedDays.map((day) => dauByDay.get(day)?.size ?? 0),
      dauDayCount,
    };
  }, [participants, players]);

  useEffect(() => {
    return () => {
      signupsChartRef.current?.destroy();
      uniqueDauChartRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!chartJsReady || !window.Chart || !signupsCanvasRef.current) {
      signupsChartRef.current?.destroy();
      signupsChartRef.current = null;
      return;
    }

    signupsChartRef.current?.destroy();
    const context = signupsCanvasRef.current.getContext("2d");
    if (!context) {
      return;
    }

    signupsChartRef.current = new window.Chart(context, {
      type: "bar",
      data: {
        labels: chartSeries.signupLabels,
        datasets: [
          {
            data: chartSeries.signups,
            backgroundColor: "#378ADD",
            borderRadius: 6,
            maxBarThickness: 18,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              label: (context) => `${context.parsed.y} inscription${context.parsed.y > 1 ? "s" : ""}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false, drawBorder: false }, ticks: { color: "#999999", font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { precision: 0, color: "#999999", font: { size: 10 } }, grid: { color: "#F0F0EC", drawBorder: false } },
        },
      },
    });
  }, [chartJsReady, chartSeries.signupLabels, chartSeries.signups]);

  useEffect(() => {
    if (!chartJsReady || !window.Chart || !uniqueDauCanvasRef.current) {
      uniqueDauChartRef.current?.destroy();
      uniqueDauChartRef.current = null;
      return;
    }

    uniqueDauChartRef.current?.destroy();
    const context = uniqueDauCanvasRef.current.getContext("2d");
    if (!context) {
      return;
    }

    const gradient = context.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, "rgba(234, 243, 222, 0.3)");
    gradient.addColorStop(1, "rgba(234, 243, 222, 0)");

    uniqueDauChartRef.current = new window.Chart(context, {
      type: "line",
      data: {
        labels: chartSeries.dauLabels,
        datasets: [
          {
            data: chartSeries.dauReel,
            borderColor: "#639922",
            backgroundColor: gradient,
            fill: true,
            tension: 0.28,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              label: (context) => `${context.parsed.y} joueur${context.parsed.y > 1 ? "s" : ""}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false, drawBorder: false }, ticks: { color: "#999999", font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { precision: 0, color: "#999999", font: { size: 10 } }, grid: { color: "#F0F0EC", drawBorder: false } },
        },
      },
    });
  }, [chartJsReady, chartSeries.dauLabels, chartSeries.dauReel]);

  const playerKpis = [
    {
      accent: "#639922",
      label: "Joueurs actifs J7",
      value: formatCount(playerMetrics.active7Days),
      trend: `${formatPercent(rates.active7Pct)} de la base active`,
      trendColor: "#3B6D11",
      description: "Sur 7 jours glissants via last_real_activity_at",
    },
    {
      accent: "#378ADD",
      label: "Joueurs actifs J30",
      value: formatCount(playerMetrics.active30Days),
      trend: `${formatPercent(rates.active30Pct)} de la base active`,
      trendColor: "#3B6D11",
      description: "Base encore vraiment active sur 30 jours",
    },
    {
      accent: "#D4537E",
      label: "Nouveaux joueurs J30",
      value: formatCount(playerMetrics.new30Days),
      trend: "Acquisition recente",
      trendColor: "#993556",
      description: "Base sur created_time sur 30 jours glissants",
    },
    {
      accent: "#E24B4A",
      label: "Joueurs inactifs",
      value: formatCount(playerMetrics.inactive),
      trend: `${formatPercent(rates.inactivePct)} de la base — a reactiver`,
      trendColor: "#A32D2D",
      description: "Segments Inactif et Jamais actif cumules",
      critical: true,
    },
    {
      accent: "#639922",
      label: "Marchands avec jeu",
      value: formatCount(merchantMetrics.withGames),
      trend: `${formatPercent(rates.merchantsWithGamesPct)} des enseignes activees`,
      trendColor: "#3B6D11",
      description: "Mesure le passage a la creation d un premier jeu",
    },
    {
      accent: "#EF9F27",
      label: "Marchands avec participation",
      value: formatCount(merchantMetrics.withParticipation),
      trend: `${formatPercent(rates.merchantsWithParticipationPct)} des enseignes`,
      trendColor: "#633806",
      description: "Mesure l engagement reel des campagnes",
    },
  ];

  const retentionItems = [
    { label: "J0", value: rates.retentionJ0, helper: "Inscription" },
    { label: "J1", value: rates.retentionJ1, helper: "Critique iOS" },
    { label: "J7", value: rates.retentionJ7, helper: "Acceptable" },
    { label: "J30", value: rates.retentionJ30, helper: "Bon signe" },
  ];

  return (
    <section className="space-y-4 bg-[#F7F7F5] text-[#1A1A1A]">
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"
        strategy="afterInteractive"
        onLoad={() => setChartJsReady(true)}
      />
      <div className="flex flex-col gap-4 rounded-[12px] border border-[#E8E8E4] bg-white p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1A1A1A]">Activite</h1>
          <p className="mt-2 text-[13px] text-[#666666]">
            Suivi de la retention joueurs et de l activation commercants
          </p>
        </div>
        <p className="text-[12px] text-[#999999]">{getUpdatedLabel()}</p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-[10px] border border-[#E8E8E4] bg-white p-3">
        {[
          { id: "kpi", label: "KPI" },
          { id: "players", label: "Joueurs" },
          { id: "merchants", label: "Commercants" },
          { id: "segments", label: "Segments utiles" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as ActivityTab)}
            className={`rounded-[7px] px-4 py-[10px] text-[12.5px] transition ${
              activeTab === tab.id
                ? "bg-[#EAF3DE] font-medium text-[#3B6D11]"
                : "text-[#666666] hover:bg-[#F7F7F5]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-[12px] border border-[#E8E8E4] bg-white px-5 py-10 text-[12.5px] text-[#999999]">
          Chargement des indicateurs d activite...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[12px] border border-[#F2CACA] bg-[#FCEBEB] px-5 py-4 text-[12.5px] text-[#A32D2D]">
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          {activeTab === "kpi" ? (
            <div className="space-y-4">
              <section className="space-y-3">
                <div>
                  <h2 className="text-[15px] font-medium text-[#1A1A1A]">
                    Joueurs — activite recente
                  </h2>
                  <p className="mt-1 text-[12px] text-[#999999]">
                    Vue rapide de l activite recente et de l activation commercants
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {playerKpis.map((item) => (
                    <MetricCard key={item.label} {...item} />
                  ))}
                </div>
              </section>

              <section className="rounded-[12px] border border-[#E8E8E4] bg-white">
                <div className="border-b border-[#F0F0EC] px-5 py-4">
                  <h2 className="text-[15px] font-medium text-[#1A1A1A]">Retention joueurs</h2>
                </div>
                <div className="grid gap-4 px-5 py-5 md:grid-cols-4">
                  {retentionItems.map((item, index) => {
                    const tone = getRetentionTone(item.value);

                    return (
                      <div
                        key={item.label}
                        className={`flex flex-col items-center gap-3 ${
                          index < retentionItems.length - 1 ? "md:border-r md:border-[#F0F0EC]" : ""
                        }`}
                      >
                        <div
                          className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-[15px] font-medium"
                          style={{ backgroundColor: tone.bg, color: tone.text }}
                        >
                          {formatPercent(item.value)}
                        </div>
                        <div className="text-center">
                          <p className="text-[12px] font-medium text-[#1A1A1A]">{item.label}</p>
                          <p className="mt-1 text-[11px] text-[#999999]">{item.helper}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-2">
                <article className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
                  <h2 className="mb-1 text-[15px] font-medium text-[#1A1A1A]">Nouvelles inscriptions — 30 jours</h2>
                  <p className="mb-4 text-[11px] text-[#999999]">Basé sur created_time des joueurs chargés</p>
                  <div style={{ height: 180 }}>
                    <canvas ref={signupsCanvasRef} />
                  </div>
                  <p className="mt-2 text-[10px] text-[#999999]">
                    Basé sur {participants.length} participations chargées · fenêtre ajustée automatiquement
                  </p>
                </article>
                <article className="rounded-[12px] border border-[#E8E8E4] bg-white p-5 xl:col-span-2">
                  <h2 className="mb-1 text-[15px] font-medium text-[#1A1A1A]">Joueurs uniques par jour — {chartSeries.dauDayCount} jours</h2>
                  <p className="mb-4 text-[11px] text-[#999999]">DAU réel calculé depuis les participations · joueurs distincts par jour</p>
                  <div style={{ height: 180 }}>
                    <canvas ref={uniqueDauCanvasRef} />
                  </div>
                  <p className="mt-2 text-[10px] text-[#999999]">
                    Basé sur {participants.length} participations chargées · fenêtre ajustée automatiquement
                  </p>
                </article>
              </section>
            </div>
          ) : null}

          {activeTab === "players" ? (
            <section className="rounded-[12px] border border-[#E8E8E4] bg-white">
              <div className="border-b border-[#F0F0EC] px-5 py-4">
                <h2 className="text-[15px] font-medium text-[#1A1A1A]">Joueurs</h2>
                <p className="mt-1 text-[12px] text-[#999999]">
                  {formatCount(players.length)} joueurs exploites depuis users et prizes
                </p>
              </div>
              <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
                <MetricCard
                  accent="#7F77DD"
                  label="Tres actifs"
                  value={formatCount(playerMetrics.veryActive)}
                  trend="Derniers jours tres engages"
                  trendColor="#534AB7"
                  description="Activite reelle observee sur les 3 derniers jours"
                />
                <MetricCard
                  accent="#378ADD"
                  label="Actifs"
                  value={formatCount(playerMetrics.active)}
                  trend="Base reguliere"
                  trendColor="#185FA5"
                  description="Activite observee entre 4 et 14 jours"
                />
                <MetricCard
                  accent="#EF9F27"
                  label="A relancer"
                  value={formatCount(playerMetrics.toRelaunch)}
                  trend="Reactivation possible"
                  trendColor="#633806"
                  description="Segment deja utilise dans la logique admin des joueurs"
                />
                <MetricCard
                  accent="#E24B4A"
                  label="Inactifs"
                  value={formatCount(
                    players.filter((player) => player.assiduityLabel === "Inactif").length,
                  )}
                  trend="Hors usage recent"
                  trendColor="#A32D2D"
                  description="Aucune activite recente detectee au dela de 45 jours"
                  critical
                />
                <MetricCard
                  accent="#D4537E"
                  label="Jamais actifs"
                  value={formatCount(playerMetrics.neverActive)}
                  trend="Activation a travailler"
                  trendColor="#993556"
                  description="Utilisateurs sans last_real_activity_at exploitable"
                />
              </div>
              <div className="flex flex-wrap gap-2 border-t border-[#F0F0EC] px-5 py-4">
                <Link
                  className="rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-[9px] text-[12px] text-[#666666] transition hover:bg-[#EAF3DE] hover:text-[#3B6D11]"
                  href="/admin/joueurs"
                >
                  Voir les joueurs
                </Link>
              </div>
            </section>
          ) : null}

          {activeTab === "merchants" ? (
            <section className="rounded-[12px] border border-[#E8E8E4] bg-white">
              <div className="border-b border-[#F0F0EC] px-5 py-4">
                <h2 className="text-[15px] font-medium text-[#1A1A1A]">Commercants</h2>
                <p className="mt-1 text-[12px] text-[#999999]">
                  {formatCount(merchantMetrics.registered)} enseignes analysees pour le funnel d activation
                </p>
              </div>
              <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
                <MetricCard
                  accent="#639922"
                  label="Commercants inscrits"
                  value={formatCount(merchantMetrics.registered)}
                  trend="Base totale"
                  trendColor="#3B6D11"
                  description="Total des documents enseignes remontes dans l admin"
                />
                <MetricCard
                  accent="#639922"
                  label="Avec au moins un jeu"
                  value={formatCount(merchantMetrics.withGames)}
                  trend={`${formatPercent(rates.merchantsWithGamesPct)} actives`}
                  trendColor="#3B6D11"
                  description="Mesure via les jeux lies au owner de l enseigne"
                />
                <MetricCard
                  accent="#E24B4A"
                  label="Sans jeu"
                  value={formatCount(merchantMetrics.withoutGames)}
                  trend="Blocage d activation"
                  trendColor="#A32D2D"
                  description="Inscrits mais sans jeu rattache de facon exploitable"
                  critical
                />
                <MetricCard
                  accent="#EF9F27"
                  label="Avec participation"
                  value={formatCount(merchantMetrics.withParticipation)}
                  trend={`${formatPercent(rates.merchantsWithParticipationPct)} engages`}
                  trendColor="#633806"
                  description="Signal minimal de traction reellement exploitable"
                />
                <MetricCard
                  accent="#D4537E"
                  label="Sans premiere participation"
                  value={formatCount(merchantMetrics.withoutFirstParticipation)}
                  trend="Jeu cree mais pas encore active"
                  trendColor="#993556"
                  description="Ont cree au moins un jeu mais n ont pas encore leur premier trafic"
                />
                <MetricCard
                  accent="#378ADD"
                  label="Lancement recent J30"
                  value={formatCount(merchantMetrics.recentlyLaunched)}
                  trend="Campagnes recentes"
                  trendColor="#185FA5"
                  description="Base sur la date de debut du jeu le plus recent"
                />
              </div>
              <div className="flex flex-wrap gap-2 border-t border-[#F0F0EC] px-5 py-4">
                <Link
                  className="rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-[9px] text-[12px] text-[#666666] transition hover:bg-[#EAF3DE] hover:text-[#3B6D11]"
                  href="/admin/commercants"
                >
                  Voir les commercants
                </Link>
              </div>
            </section>
          ) : null}

          {activeTab === "segments" ? (
            <section className="rounded-[12px] border border-[#E8E8E4] bg-white">
              <div className="border-b border-[#F0F0EC] px-5 py-4">
                <h2 className="text-[15px] font-medium text-[#1A1A1A]">Segments utiles</h2>
                <p className="mt-1 text-[12px] text-[#999999]">
                  Groupes actionnables rapidement sans ajouter de logique analytique lourde
                </p>
              </div>
              <div className="grid gap-3 p-5 xl:grid-cols-2">
                <div className="rounded-[10px] border border-[#E8E8E4] bg-[#FFFFFF] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-[#999999]">Joueurs a relancer</p>
                      <strong className="mt-2 block text-[24px] font-medium text-[#1A1A1A]">
                        {formatCount(playerMetrics.toRelaunch + playerMetrics.neverActive)}
                      </strong>
                    </div>
                    <span className="rounded-full bg-[#FBEAF0] px-3 py-[5px] text-[11px] font-medium text-[#993556]">
                      Priorite CRM
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {usefulSegments.inactivePlayers.length > 0 ? (
                      usefulSegments.inactivePlayers.map((player) => (
                        <div key={player.id} className="rounded-[8px] bg-[#FAFAF8] px-3 py-2">
                          <p className="text-[12px] font-medium text-[#1A1A1A]">
                            {getPlayerLabel(player)}
                          </p>
                          <p className="mt-1 text-[11px] text-[#999999]">
                            {player.assiduityLabel} · {player.lastRealActivityLabel}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[12px] text-[#999999]">Aucun joueur prioritaire.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-[10px] border border-[#E8E8E4] bg-[#FFFFFF] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-[#999999]">Commercants sans premiere participation</p>
                      <strong className="mt-2 block text-[24px] font-medium text-[#1A1A1A]">
                        {formatCount(merchantMetrics.withoutFirstParticipation)}
                      </strong>
                    </div>
                    <span className="rounded-full bg-[#FAEEDA] px-3 py-[5px] text-[11px] font-medium text-[#633806]">
                      Activation
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {usefulSegments.merchantsWithoutParticipation.length > 0 ? (
                      usefulSegments.merchantsWithoutParticipation.map((merchant) => (
                        <div key={merchant.id} className="rounded-[8px] bg-[#FAFAF8] px-3 py-2">
                          <p className="text-[12px] font-medium text-[#1A1A1A]">{merchant.name}</p>
                          <p className="mt-1 text-[11px] text-[#999999]">
                            {formatCount(merchant.gamesCreatedCount)} jeu(x) · {formatCount(merchant.participationsCount)} participation
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[12px] text-[#999999]">Aucun commercant bloque.</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-[#F0F0EC] px-5 py-4">
                <Link
                  className="rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-[9px] text-[12px] text-[#666666] transition hover:bg-[#EAF3DE] hover:text-[#3B6D11]"
                  href="/admin/joueurs"
                >
                  Ouvrir les joueurs
                </Link>
                <Link
                  className="rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-[9px] text-[12px] text-[#666666] transition hover:bg-[#EAF3DE] hover:text-[#3B6D11]"
                  href="/admin/commercants"
                >
                  Ouvrir les commercants
                </Link>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
