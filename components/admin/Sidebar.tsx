"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, type User } from "firebase/auth";
import { collection, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase/auth";
import { db } from "@/lib/firebase/client-app";
import { subscribeDashboardData } from "@/lib/firebase/dashboardQueries";
import type { DashboardData } from "@/types/dashboard";

type SidebarProps = {
  user: User;
};

type SidebarBadgeTone = "red" | "green";

type SidebarNavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: {
    count: number;
    tone: SidebarBadgeTone;
  };
};

type SidebarSection = {
  id: string;
  label?: string;
  items: SidebarNavItem[];
};

const initialDashboardData: DashboardData = {
  kpis: [],
  bannerAlerts: [],
  activeGames: [],
  sideAlerts: [],
  merchants: [],
  notifications: [],
  activePlayersExport: [],
};

function getInitials(user: User) {
  const source = user.displayName?.trim() || user.email?.trim() || "Proxiplay";
  const parts = source
    .split(/[.\s@_-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "PP";
}

function normalizePrizeStatus(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isPrizeClaimed(data: Record<string, unknown>) {
  return (
    data.claimed === true ||
    data.claimed_at !== undefined ||
    data.redeemed_at !== undefined ||
    ["retire", "retiree", "retiré", "redeemed", "claimed", "remis"].includes(
      normalizePrizeStatus(data.status),
    )
  );
}

function badgeClasses(tone: SidebarBadgeTone) {
  return tone === "red"
    ? "bg-[#FCEBEB] text-[#A32D2D]"
    : "bg-[#EAF3DE] text-[#3B6D11]";
}

function buildSections(counts: {
  gamesToFix: number;
  merchantsWithoutGame: number;
  unclaimedPrizes: number;
}): SidebarSection[] {
  return [
    {
      id: "overview",
      items: [{ href: "/admin/dashboard", label: "Dashboard", icon: "◈" }],
    },
    {
      id: "activity",
      label: "Activite",
      items: [
        {
          href: "/admin/games",
          label: "Jeux",
          icon: "◧",
          badge:
            counts.gamesToFix > 0
              ? { count: counts.gamesToFix, tone: "red" }
              : undefined,
        },
        {
          href: "/admin/commercants",
          label: "Commercants",
          icon: "◫",
          badge:
            counts.merchantsWithoutGame > 0
              ? { count: counts.merchantsWithoutGame, tone: "red" }
              : undefined,
        },
        { href: "/admin/joueurs", label: "Joueurs", icon: "◎" },
        {
          href: "/admin/winners",
          label: "Gagnants",
          icon: "◉",
          badge:
            counts.unclaimedPrizes > 0
              ? { count: counts.unclaimedPrizes, tone: "green" }
              : undefined,
        },
        { href: "/admin/activite", label: "Activite", icon: "◌" },
        { href: "/admin/games-technique", label: "Jeux Tech", icon: "◍" },
        {
          href: "/admin/commercants-technique",
          label: "Commercants Tech",
          icon: "◬",
        },
      ],
    },
    {
      id: "communication",
      label: "Communication",
      items: [
        { href: "/admin/notifications/nouvelle", label: "Notifications", icon: "◯" },
        { href: "/admin/activite", label: "Relances auto", icon: "◪" },
        { href: "/admin/parrainage", label: "Parrainage", icon: "△" },
      ],
    },
    {
      id: "system",
      label: "Systeme",
      items: [
        { href: "/admin/classements", label: "Classements", icon: "◯" },
        { href: "/admin/settings", label: "Parametres", icon: "◪" },
      ],
    },
  ];
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [dashboardData, setDashboardData] = useState<DashboardData>(initialDashboardData);
  const [unclaimedPrizes, setUnclaimedPrizes] = useState(0);

  useEffect(() => {
    let active = true;
    const unsubs: Unsubscribe[] = [];

    void subscribeDashboardData((nextData) => {
      if (!active) return;
      setDashboardData(nextData);
    });

    const prizesUnsubscribe = onSnapshot(
      collection(db, "prizes"),
      (snapshot) => {
        const nextCount = snapshot.docs.reduce((total, prizeDoc) => {
          const data = prizeDoc.data() as Record<string, unknown>;
          return isPrizeClaimed(data) ? total : total + 1;
        }, 0);

        setUnclaimedPrizes(nextCount);
      },
      () => {
        setUnclaimedPrizes(0);
      },
    );
    unsubs.push(prizesUnsubscribe);

    return () => {
      active = false;
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const counts = useMemo(() => {
    const gamesToFix = dashboardData.bannerAlerts.filter((alert) =>
      alert.href?.includes("/admin/games/") &&
      alert.description.toLowerCase().includes("corriger"),
    ).length;

    const merchantsWithoutGame = dashboardData.sideAlerts.filter((alert) =>
      alert.href?.includes("/admin/commercants/") &&
      alert.description.toLowerCase().includes("sans jeu actif"),
    ).length;

    return {
      gamesToFix,
      merchantsWithoutGame,
      unclaimedPrizes,
    };
  }, [dashboardData.bannerAlerts, dashboardData.sideAlerts, unclaimedPrizes]);

  const sections = useMemo(() => buildSections(counts), [counts]);
  const initials = useMemo(() => getInitials(user), [user]);

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col border-r border-[#E8E8E4] bg-[#FFFFFF]">
      <div className="border-b border-[#E8E8E4] px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#639922] text-[15px] text-white">
            ●
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-[#1A1A1A]">Proxiplay</div>
            <div className="text-[10px] text-[#999999]">Admin Console</div>
          </div>
        </div>

        <div className="mt-5 rounded-[8px] bg-[#F7F7F5] p-2">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EAF3DE] text-[11px] font-medium text-[#3B6D11]">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] text-[#666666]">{user.email ?? "Compte admin"}</div>
            </div>
            <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#639922]" aria-hidden="true" />
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-4 px-2 py-3" aria-label="Navigation admin">
        {sections.map((section) => (
          <div key={section.id}>
            {section.label ? (
              <div className="px-3 pb-2 text-[9px] uppercase tracking-[0.16em] text-[#BBBBBB]">
                {section.label}
              </div>
            ) : null}
            <div className="flex flex-col gap-[2px]">
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-[7px] px-2 py-[7px] text-[12.5px] transition ${
                      isActive
                        ? "bg-[#EAF3DE] font-medium text-[#3B6D11]"
                        : "text-[#666666] hover:bg-[#F7F7F5]"
                    }`}
                  >
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center text-[14px] leading-none">
                      {item.icon}
                    </div>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span
                        className={`rounded-full px-2 py-[2px] text-[10px] font-medium ${badgeClasses(item.badge.tone)}`}
                      >
                        {item.badge.count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[#E8E8E4] px-2 py-3">
        <button
          type="button"
          onClick={() => signOut(auth)}
          className="flex w-full items-center gap-3 rounded-[7px] px-2 py-[7px] text-left text-[12.5px] text-[#999999] transition hover:bg-[#F7F7F5] hover:text-[#666666]"
        >
          <div className="flex h-4 w-4 items-center justify-center text-[14px] leading-none">→</div>
          <span>Se deconnecter</span>
        </button>
      </div>
    </aside>
  );
}
