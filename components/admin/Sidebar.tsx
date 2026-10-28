"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, type User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase/auth";
import { getSidebarBadgeCounts } from "@/lib/firebase/dashboardQueries";

type SidebarProps = {
  user: User;
  onNavigate?: () => void;
  onClose?: () => void;
};

type SidebarBadgeTone = "red" | "green";

type SidebarNavItem = {
  href: string;
  label: string;
  icon: string;
  groupLabel?: string;
  badge?: { count: number; tone: SidebarBadgeTone };
};

type SidebarSection = {
  id: string;
  label: string;
  icon: string;
  items: SidebarNavItem[];
};

function getInitials(user: User) {
  const source = user.displayName?.trim() || user.email?.trim() || "Proxiplay";
  const initials = source
    .split(/[.\s@_-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "PP";
}

function badgeClasses(tone: SidebarBadgeTone) {
  return tone === "red" ? "bg-[#FCEBEB] text-[#A32D2D]" : "bg-[#EAF3DE] text-[#3B6D11]";
}

function isItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function buildSections(counts: { gamesToFix: number; merchantsWithoutGame: number }): SidebarSection[] {
  return [
    {
      id: "animations",
      label: "Animations",
      icon: "◇",
      items: [
        { href: "/admin/games", label: "Jeux", icon: "◧", badge: counts.gamesToFix > 0 ? { count: counts.gamesToFix, tone: "red" } : undefined },
        { href: "/admin/campaigns", label: "Campagnes & animations", icon: "◨" },
        { href: "/admin/defi-du-mois", label: "Défi du mois", icon: "◇" },
        { href: "/admin/winners", label: "Lots & gagnants", icon: "◉" },
      ],
    },
    {
      id: "communication",
      label: "Communication",
      icon: "◯",
      items: [
        { href: "/admin/publicite", label: "Publicités", icon: "▣" },
        { href: "/admin/notifications", label: "Notifications push", icon: "◯" },
      ],
    },
    {
      id: "users",
      label: "Utilisateurs",
      icon: "◎",
      items: [
        { href: "/admin/joueurs", label: "Joueurs", icon: "◎" },
        { href: "/admin/commercants", label: "Commerçants", icon: "◫", badge: counts.merchantsWithoutGame > 0 ? { count: counts.merchantsWithoutGame, tone: "red" } : undefined },
      ],
    },
    {
      id: "referrals",
      label: "Parrainage",
      icon: "△",
      items: [
        { href: "/admin/parrainage", label: "Parrainage joueurs", icon: "△" },
        { href: "/admin/parrainage/jeu", label: "Jeux de parrainage", icon: "◇" },
        { href: "/admin/parrainage-commercants", label: "Parrainage commerçants", icon: "◫" },
      ],
    },
    {
      id: "prospecting",
      label: "Prospection",
      icon: "⌕",
      items: [
        { href: "/admin/prospection", label: "Prospects", icon: "⌕" },
        { href: "/admin/relances-commercants", label: "Relances commerçants", icon: "◈" },
      ],
    },
    {
      id: "management",
      label: "Gestion",
      icon: "⚙",
      items: [
        { href: "/admin/abonnements", label: "Abonnements", icon: "◊" },
        { href: "/admin/commercants-technique", label: "Diagnostic commerçants", icon: "◌", groupLabel: "Supervision technique" },
        { href: "/admin/games-technique", label: "Diagnostic jeux", icon: "◌" },
        { href: "/admin/relances-auto", label: "Relances automatiques", icon: "◌" },
      ],
    },
  ];
}

export function Sidebar({ user, onNavigate, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [gamesToFix, setGamesToFix] = useState(0);
  const [merchantsWithoutGame, setMerchantsWithoutGame] = useState(0);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [closedActiveSections, setClosedActiveSections] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    void getSidebarBadgeCounts().then((counts) => {
      if (!active) return;
      setGamesToFix(counts.gamesToFix);
      setMerchantsWithoutGame(counts.merchantsWithoutGame);
    });

    return () => {
      active = false;
    };
  }, []);

  const sections = useMemo(
    () => buildSections({ gamesToFix, merchantsWithoutGame }),
    [gamesToFix, merchantsWithoutGame],
  );

  const initials = useMemo(() => getInitials(user), [user]);
  const dashboardActive = isItemActive(pathname, "/admin/dashboard");

  const toggleSection = (id: string, isActive: boolean, isOpen: boolean) => {
    if (isActive) {
      setClosedActiveSections((current) =>
        isOpen ? [...new Set([...current, id])] : current.filter((sectionId) => sectionId !== id),
      );
      return;
    }

    setExpandedSections((current) =>
      isOpen ? current.filter((sectionId) => sectionId !== id) : [...current, id],
    );
  };

  const navigateToSection = (sectionId: string) => {
    setClosedActiveSections((current) => current.filter((id) => id !== sectionId));
    onNavigate?.();
  };

  return (
    <aside className="flex h-full min-h-0 w-[280px] max-w-[86vw] shrink-0 flex-col bg-[#FFFFFF]" aria-label="Menu principal">
      <div className="border-b border-[#E8E8E4] px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#639922] text-[15px] text-white">●</div>
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-[#1A1A1A]">Proxiplay</div>
            <div className="text-[10px] text-[#999999]">Admin Console</div>
          </div>
          {onClose ? <button type="button" onClick={onClose} className="ml-auto flex h-10 w-10 items-center justify-center rounded-[8px] text-xl text-[#666666] transition hover:bg-[#F7F7F5]" aria-label="Fermer le menu">×</button> : null}
        </div>

        <div className="mt-5 rounded-[8px] bg-[#F7F7F5] p-2">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EAF3DE] text-[11px] font-medium text-[#3B6D11]">{initials}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-[11px] text-[#666666]">{user.email ?? "Compte admin"}</div></div>
            <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#639922]" aria-hidden="true" />
          </div>
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-3" aria-label="Navigation admin">
        <Link href="/admin/dashboard" onClick={onNavigate} aria-current={dashboardActive ? "page" : undefined} className={`flex items-center gap-3 rounded-[7px] px-3 py-[9px] text-[12.5px] transition ${dashboardActive ? "bg-[#EAF3DE] font-medium text-[#3B6D11]" : "text-[#666666] hover:bg-[#F7F7F5]"}`}>
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[14px] leading-none">◈</span>
          <span>Tableau de bord</span>
        </Link>

        <div className="my-2 border-t border-[#F0F0EC]" />

        {sections.map((section) => {
          const isActive = section.items.some((item) => isItemActive(pathname, item.href));
          const isOpen = isActive
            ? !closedActiveSections.includes(section.id)
            : expandedSections.includes(section.id);

          return (
            <div key={section.id}>
              <button type="button" onClick={() => toggleSection(section.id, isActive, isOpen)} aria-expanded={isOpen} className={`flex w-full items-center gap-3 rounded-[7px] px-3 py-[9px] text-left text-[12.5px] transition ${isActive ? "font-medium text-[#3B6D11]" : "text-[#666666] hover:bg-[#F7F7F5]"}`}>
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[14px] leading-none">{section.icon}</span>
                <span className="flex-1">{section.label}</span>
                <span className={`text-[13px] transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden="true">›</span>
              </button>

              {isOpen ? (
                <div className="mb-1 ml-3 border-l border-[#E8E8E4] py-1 pl-2">
                  {section.items.map((item) => {
                    const active = isItemActive(pathname, item.href);
                    return (
                      <div key={item.href}>
                        {item.groupLabel ? <p className="px-2 pb-1 pt-2 text-[9px] font-medium uppercase tracking-[0.12em] text-[#999999]">{item.groupLabel}</p> : null}
                        <Link href={item.href} onClick={() => navigateToSection(section.id)} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-[7px] px-2 py-[7px] text-[12px] transition ${active ? "bg-[#EAF3DE] font-medium text-[#3B6D11]" : "text-[#666666] hover:bg-[#F7F7F5]"}`}>
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[13px] leading-none">{item.icon}</span>
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.badge ? <span className={`rounded-full px-2 py-[2px] text-[10px] font-medium ${badgeClasses(item.badge.tone)}`}>{item.badge.count}</span> : null}
                        </Link>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-[#E8E8E4] px-2 py-3">
        <button type="button" onClick={() => signOut(auth)} className="flex w-full items-center gap-3 rounded-[7px] px-2 py-[7px] text-left text-[12.5px] text-[#999999] transition hover:bg-[#F7F7F5] hover:text-[#666666]">
          <span className="flex h-4 w-4 items-center justify-center text-[14px] leading-none">→</span>
          <span>Se déconnecter</span>
        </button>
      </div>
    </aside>
  );
}
