"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getGamesList,
  getMerchantsList,
  getPlayersList,
  getReferralOverview,
  type AdminGameListItem,
  type AdminMerchantListItem,
  type AdminPlayerListItem,
  type AdminReferralInviterListItem,
} from "@/lib/firebase/adminQueries";

type Tab = "merchants" | "games" | "players" | "referrals";
type MerchantSort = "clicks" | "participations" | "followers" | "name";
type GameSort = "views" | "participations" | "end_date" | "name";
type PlayerSort = "games_played" | "wins" | "activity" | "name";
type ReferralSort = "invitees" | "rewards" | "activity" | "name";

const thClass =
  "px-4 py-[10px] text-left text-[10.5px] uppercase tracking-[0.05em] text-[#999999]";
const tdClass = "px-4 py-[11px] text-[12.5px] text-[#1A1A1A]";

function formatCount(value: number | null) {
  return value === null ? "Non renseigne" : new Intl.NumberFormat("fr-FR").format(value);
}

function normalizeString(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getInitials(value: string) {
  return (
    value
      .split(/[.\s@_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "PP"
  );
}

function getPlayerLabel(player: AdminPlayerListItem) {
  return player.fullName !== "Non renseigne"
    ? player.fullName
    : player.pseudo !== "Non renseigne"
      ? player.pseudo
      : player.email;
}

function getMerchantStatus(merchant: AdminMerchantListItem) {
  const recentWindow = 7 * 24 * 60 * 60 * 1000;
  const recentGame =
    merchant.latestGameStartValue > 0 && Date.now() - merchant.latestGameStartValue <= recentWindow;
  return merchant.activeGamesCount > 0 || recentGame || !(merchant.participationsCount < 10 || merchant.followersCount === 0)
    ? "actif"
    : "inactif";
}

function rankColor(index: number) {
  return index === 0 ? "#B8860B" : index === 1 ? "#888888" : index === 2 ? "#A0522D" : "#999999";
}

function barWidth(value: number, max: number) {
  return `${max <= 0 ? 0 : Math.max(6, Math.round((value / max) * 100))}%`;
}

function formatLongDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function getPlatformBadgeClasses(platform: "iOS" | "Android" | "Inconnue") {
  return platform === "iOS"
    ? "bg-[#E6F1FB] text-[#185FA5]"
    : platform === "Android"
      ? "bg-[#EAF3DE] text-[#3B6D11]"
      : "bg-[#F7F7F5] text-[#666666]";
}

function topCard(label: string, icon: string, name: string, value: string, accent: string) {
  return (
    <article className="overflow-hidden rounded-[10px] border border-[#E8E8E4] bg-white">
      <div className="h-[3px]" style={{ backgroundColor: accent }} />
      <div className="space-y-3 px-5 py-4">
        <div className="flex items-start justify-between">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[#999999]">{label}</span>
          <span className="text-[28px] leading-none">{icon}</span>
        </div>
        <div>
          <h3 className="line-clamp-2 text-[15px] font-medium text-[#1A1A1A]">{name}</h3>
          <p className="mt-2 text-[12px] font-medium" style={{ color: accent }}>{value}</p>
        </div>
      </div>
    </article>
  );
}

export default function AdminRankingsPage() {
  const [tab, setTab] = useState<Tab>("merchants");
  const [merchants, setMerchants] = useState<AdminMerchantListItem[]>([]);
  const [games, setGames] = useState<AdminGameListItem[]>([]);
  const [players, setPlayers] = useState<AdminPlayerListItem[]>([]);
  const [referrers, setReferrers] = useState<AdminReferralInviterListItem[]>([]);
  const [search, setSearch] = useState("");
  const [merchantSort, setMerchantSort] = useState<MerchantSort>("participations");
  const [gameSort, setGameSort] = useState<GameSort>("participations");
  const [playerSort, setPlayerSort] = useState<PlayerSort>("games_played");
  const [referralSort, setReferralSort] = useState<ReferralSort>("invitees");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [merchantItems, gameItems, playerItems, referralOverview] = await Promise.all([
          getMerchantsList(),
          getGamesList(),
          getPlayersList(),
          getReferralOverview(),
        ]);
        if (!cancelled) {
          setMerchants(merchantItems);
          setGames(gameItems);
          setPlayers(playerItems);
          setReferrers(referralOverview.inviters);
        }
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) {
          setError("Impossible de charger les classements depuis Firestore.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedSearch = normalizeString(search.trim());
  const rankedMerchants = useMemo(() => [...merchants.filter((m) => normalizedSearch.length === 0 || normalizeString(m.name).includes(normalizedSearch) || normalizeString(m.city).includes(normalizedSearch))].sort((a, b) => merchantSort === "clicks" ? b.clicksCount - a.clicksCount || a.name.localeCompare(b.name, "fr") : merchantSort === "followers" ? b.followersCount - a.followersCount || a.name.localeCompare(b.name, "fr") : merchantSort === "name" ? a.name.localeCompare(b.name, "fr") : b.participationsCount - a.participationsCount || a.name.localeCompare(b.name, "fr")), [merchantSort, merchants, normalizedSearch]);
  const rankedGames = useMemo(() => [...games.filter((g) => normalizedSearch.length === 0 || normalizeString(g.name).includes(normalizedSearch) || normalizeString(g.enseigneName).includes(normalizedSearch))].sort((a, b) => gameSort === "views" ? b.clicksCount - a.clicksCount || a.name.localeCompare(b.name, "fr") : gameSort === "end_date" ? a.endDateValue - b.endDateValue : gameSort === "name" ? a.name.localeCompare(b.name, "fr") : b.participationsCount - a.participationsCount || a.name.localeCompare(b.name, "fr")), [gameSort, games, normalizedSearch]);
  const rankedPlayers = useMemo(() => [...players.filter((p) => normalizedSearch.length === 0 || normalizeString(getPlayerLabel(p)).includes(normalizedSearch) || normalizeString(p.pseudo).includes(normalizedSearch) || normalizeString(p.city).includes(normalizedSearch))].sort((a, b) => playerSort === "wins" ? (b.winsCount ?? -1) - (a.winsCount ?? -1) || getPlayerLabel(a).localeCompare(getPlayerLabel(b), "fr") : playerSort === "activity" ? b.lastRealActivityValue - a.lastRealActivityValue || getPlayerLabel(a).localeCompare(getPlayerLabel(b), "fr") : playerSort === "name" ? getPlayerLabel(a).localeCompare(getPlayerLabel(b), "fr") : (b.gamesPlayedCount ?? -1) - (a.gamesPlayedCount ?? -1) || getPlayerLabel(a).localeCompare(getPlayerLabel(b), "fr")), [normalizedSearch, playerSort, players]);
  const rankedReferrers = useMemo(() => [...referrers.filter((r) => normalizedSearch.length === 0 || normalizeString(r.label).includes(normalizedSearch) || normalizeString(r.email).includes(normalizedSearch) || normalizeString(r.searchableInviteCodes).includes(normalizedSearch))].sort((a, b) => referralSort === "rewards" ? b.grantedRewardsCount - a.grantedRewardsCount || a.label.localeCompare(b.label, "fr") : referralSort === "activity" ? b.lastAcceptedAtValue - a.lastAcceptedAtValue || a.label.localeCompare(b.label, "fr") : referralSort === "name" ? a.label.localeCompare(b.label, "fr") : b.acceptedInviteesCount - a.acceptedInviteesCount || a.label.localeCompare(b.label, "fr")), [normalizedSearch, referralSort, referrers]);

  const currentSort = tab === "games" ? gameSort : tab === "players" ? playerSort : tab === "referrals" ? referralSort : merchantSort;
  const currentCount = tab === "games" ? rankedGames.length : tab === "players" ? rankedPlayers.length : tab === "referrals" ? rankedReferrers.length : rankedMerchants.length;
  const merchantsMax = Math.max(1, ...rankedMerchants.map((item) => item.clicksCount));
  const playersMax = Math.max(1, ...rankedPlayers.map((item) => item.gamesPlayedCount ?? 0));
  const referralsMax = Math.max(1, ...rankedReferrers.map((item) => item.acceptedInviteesCount));

  const exportCsv = () => {
    const date = new Intl.DateTimeFormat("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("/", "-");
    const rows = tab === "games"
      ? [["Rang", "Jeu", "Commercant", "Participations", "Gagnants", "Date fin", "Statut"], ...rankedGames.map((g, i) => [String(i + 1), g.name, g.enseigneName, String(g.participationsCount), String(g.winnersCount), g.endDateLabel, g.status])]
      : tab === "players"
        ? [["Rang", "Joueur", "Email", "Parties", "Gains", "Derniere partie"], ...rankedPlayers.map((p, i) => [String(i + 1), getPlayerLabel(p), p.email, String(p.gamesPlayedCount ?? 0), String(p.winsCount ?? 0), p.lastRealActivityLabel])]
        : tab === "referrals"
          ? [["Rang", "Parrain", "Code", "Filleuls", "En attente", "Derniere utilisation", "Bonus"], ...rankedReferrers.map((r, i) => [String(i + 1), r.label, r.latestInviteCode, String(r.acceptedInviteesCount), String(r.pendingReferralsCount), r.lastAcceptedAtLabel, r.bonusStatusLabel])]
          : [["Rang", "Commercant", "Ville", "Clics", "Participations", "Followers", "Statut"], ...rankedMerchants.map((m, i) => [String(i + 1), m.name, m.city, String(m.clicksCount), String(m.participationsCount), String(m.followersCount), getMerchantStatus(m)])];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `classement-${tab}-${date}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const sortOptions = tab === "games"
    ? [["participations", "Participations (desc)"], ["views", "Vues (desc)"], ["end_date", "Date fin"], ["name", "Nom A-Z"]]
    : tab === "players"
      ? [["games_played", "Parties jouees"], ["wins", "Gains"], ["activity", "Derniere activite"], ["name", "Nom A-Z"]]
      : tab === "referrals"
        ? [["invitees", "Filleuls"], ["rewards", "Bonus accordes"], ["activity", "Derniere utilisation"], ["name", "Nom A-Z"]]
        : [["participations", "Participations (desc)"], ["clicks", "Clics (desc)"], ["followers", "Followers (desc)"], ["name", "Nom A-Z"]];

  return (
    <section className="space-y-4 bg-[#F7F7F5] text-[#1A1A1A]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1A1A1A]">Classements</h1>
          <p className="mt-2 text-[13px] text-[#666666]">Vue lecture — leaders par commercants, jeux, joueurs et parrains</p>
        </div>
        <button type="button" onClick={exportCsv} className="rounded-[10px] border border-[#E0E0DA] bg-white px-4 py-[10px] text-[12px] text-[#1A1A1A] transition hover:bg-[#FAFAF8]">Exporter CSV</button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {topCard("Top commercant", "🏆", rankedMerchants[0]?.name ?? "Aucun commercant", rankedMerchants[0] ? `${formatCount(rankedMerchants[0].participationsCount)} participations` : "Aucune donnee", "#639922")}
        {topCard("Top jeu", "🎮", rankedGames[0]?.name ?? "Aucun jeu", rankedGames[0] ? `${formatCount(rankedGames[0].participationsCount)} participations` : "Aucune donnee", "#378ADD")}
        {topCard("Top joueur", "⭐", rankedPlayers[0] ? getPlayerLabel(rankedPlayers[0]) : "Aucun joueur", rankedPlayers[0] ? `${formatCount(rankedPlayers[0].gamesPlayedCount)} parties jouees` : "Aucune donnee", "#D4537E")}
        {topCard("Top parrain", "🔗", rankedReferrers[0]?.label ?? "Aucun parrain", rankedReferrers[0] ? `${formatCount(rankedReferrers[0].acceptedInviteesCount)} filleuls` : "Aucune donnee", "#EF9F27")}
      </div>

      <div className="flex flex-col gap-3 rounded-[10px] border border-[#E8E8E4] bg-white p-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-2">
          {[
            ["merchants", "Commercants"],
            ["games", "Jeux"],
            ["players", "Joueurs"],
            ["referrals", "Parrains"],
          ].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id as Tab)} className={`rounded-[7px] px-4 py-[10px] text-[12.5px] transition ${tab === id ? "bg-[#EAF3DE] font-medium text-[#3B6D11]" : "text-[#666666] hover:bg-[#F7F7F5]"}`}>{label}</button>
          ))}
        </div>
        <div className="hidden flex-1 lg:block" />
        <div className="flex flex-col gap-3 sm:flex-row">
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher..." className="h-[40px] w-full rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[12.5px] text-[#1A1A1A] outline-none placeholder:text-[#999999] sm:w-[220px]" />
          <select value={currentSort} onChange={(event) => tab === "games" ? setGameSort(event.target.value as GameSort) : tab === "players" ? setPlayerSort(event.target.value as PlayerSort) : tab === "referrals" ? setReferralSort(event.target.value as ReferralSort) : setMerchantSort(event.target.value as MerchantSort)} className="h-[40px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[12.5px] text-[#1A1A1A] outline-none">
            {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      <section className="overflow-hidden rounded-[12px] border border-[#E8E8E4] bg-white">
        <div className="flex flex-col gap-2 border-b border-[#F0F0EC] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[15px] font-medium text-[#1A1A1A]">Classement {tab === "merchants" ? "commercants" : tab === "games" ? "jeux" : tab === "players" ? "joueurs" : "parrains"}</h2>
          <p className="text-[12px] text-[#999999]">{formatCount(currentCount)} {tab === "merchants" ? "commercants" : tab === "games" ? "jeux" : tab === "players" ? "joueurs" : "parrains"} affiches</p>
        </div>

        {loading ? <div className="px-5 py-10 text-[12.5px] text-[#999999]">Chargement des classements...</div> : null}
        {error ? <div className="px-5 py-10 text-[12.5px] text-[#A32D2D]">{error}</div> : null}
        {!loading && !error && currentCount === 0 ? <div className="px-5 py-10 text-[12.5px] text-[#999999]">Aucun resultat pour ce filtre.</div> : null}

        {!loading && !error && currentCount > 0 ? (
          <div className="overflow-x-auto">
            {tab === "merchants" ? <table className="min-w-full"><thead><tr className="border-b border-[#F0F0EC]">{["Rang", "Commercant", "Ville", "Clics", "Participations", "Followers", "Statut", "Action"].map((label) => <th key={label} className={thClass}>{label}</th>)}</tr></thead><tbody>{rankedMerchants.map((m, i) => <tr key={m.id} className="border-b border-[#F0F0EC] hover:bg-[#FAFAF8] last:border-b-0"><td className={tdClass} style={{ color: rankColor(i) }}><span className="font-medium">#{i + 1}</span></td><td className={tdClass}><div className="flex items-center gap-3"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium ${getMerchantStatus(m) === "actif" ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F7F7F5] text-[#666666]"}`}>{getInitials(m.name)}</div><div><p className="font-medium">{m.name}</p><p className="text-[10.5px] text-[#999999]">{formatCount(m.activeGamesCount)} jeux actifs</p></div></div></td><td className={`${tdClass} text-[#666666]`}>{m.city || "Non renseignee"}</td><td className={tdClass}><div className="space-y-2"><div>{formatCount(m.clicksCount)}</div><div className="h-1 w-20 rounded-full bg-[#F0F0EC]"><div className="h-1 rounded-full" style={{ width: barWidth(m.clicksCount, merchantsMax), backgroundColor: getMerchantStatus(m) === "actif" ? "#639922" : "#E8E8E4" }} /></div></div></td><td className={`${tdClass} font-medium`}>{formatCount(m.participationsCount)}</td><td className={tdClass}>{formatCount(m.followersCount)}</td><td className={tdClass}><span className={`inline-flex rounded-full px-3 py-[4px] text-[11px] font-medium ${getMerchantStatus(m) === "actif" ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F7F7F5] text-[#666666]"}`}>{getMerchantStatus(m) === "actif" ? "Actif" : "Inactif"}</span></td><td className={tdClass}><Link href={`/admin/commercants/${m.id}`} className="font-medium text-[#639922]">Voir →</Link></td></tr>)}</tbody></table> : null}

            {tab === "games" ? <table className="min-w-full"><thead><tr className="border-b border-[#F0F0EC]">{["Rang", "Jeu", "Commercant", "Participations", "Gagnants", "Date fin", "Statut", "Action"].map((label) => <th key={label} className={thClass}>{label}</th>)}</tr></thead><tbody>{rankedGames.map((g, i) => <tr key={g.id} className="border-b border-[#F0F0EC] hover:bg-[#FAFAF8] last:border-b-0"><td className={tdClass} style={{ color: rankColor(i) }}><span className="font-medium">#{i + 1}</span></td><td className={tdClass}><div className="flex items-center gap-3"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[14px] font-medium ${["bg-[#EAF3DE] text-[#3B6D11]", "bg-[#E6F1FB] text-[#185FA5]", "bg-[#FBEAF0] text-[#993556]", "bg-[#FAEEDA] text-[#633806]"][i % 4]}`}>🎮</div><div><p className="font-medium">{g.name}</p><p className="text-[10.5px] text-[#999999]">{g.startDateLabel} → {g.endDateLabel}</p></div></div></td><td className={`${tdClass} text-[#666666]`}>{g.enseigneName}</td><td className={`${tdClass} font-medium`}>{formatCount(g.participationsCount)}</td><td className={tdClass}>{formatCount(g.winnersCount)}</td><td className={`${tdClass} text-[#666666]`}>{formatLongDate(g.endDateLabel)}</td><td className={tdClass}><span className={`inline-flex rounded-full px-3 py-[4px] text-[11px] font-medium ${g.status === "actif" ? "bg-[#EAF3DE] text-[#3B6D11]" : g.status === "termine" ? "bg-[#FCEBEB] text-[#A32D2D]" : "bg-[#E6F1FB] text-[#185FA5]"}`}>{g.status === "termine" ? "expire" : g.status}</span></td><td className={tdClass}><Link href={`/admin/games/${g.id}`} className="font-medium text-[#639922]">Voir →</Link></td></tr>)}</tbody></table> : null}

            {tab === "players" ? <table className="min-w-full"><thead><tr className="border-b border-[#F0F0EC]">{["Rang", "Joueur", "Parties jouees", "Gains", "Derniere partie", "Plateforme", "Action"].map((label) => <th key={label} className={thClass}>{label}</th>)}</tr></thead><tbody>{rankedPlayers.map((p, i) => { const platform: "iOS" | "Android" | "Inconnue" = "Inconnue"; return <tr key={p.id} className="border-b border-[#F0F0EC] hover:bg-[#FAFAF8] last:border-b-0"><td className={tdClass} style={{ color: rankColor(i) }}><span className="font-medium">#{i + 1}</span></td><td className={tdClass}><div className="flex items-center gap-3"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium ${p.activityState === "actif" ? "bg-[#FBEAF0] text-[#993556]" : p.activityState === "inactif" ? "bg-[#F7F7F5] text-[#666666]" : "bg-[#E6F1FB] text-[#185FA5]"}`}>{getInitials(getPlayerLabel(p))}</div><div><p className="font-medium">{getPlayerLabel(p)}</p><p className="text-[10.5px] text-[#999999]">{p.email.length > 28 ? `${p.email.slice(0, 27)}…` : p.email}</p></div></div></td><td className={tdClass}><div className="space-y-2"><div>{formatCount(p.gamesPlayedCount)}</div><div className="h-1 w-20 rounded-full bg-[#F0F0EC]"><div className="h-1 rounded-full bg-[#D4537E]" style={{ width: barWidth(p.gamesPlayedCount ?? 0, playersMax) }} /></div></div></td><td className={`${tdClass} font-medium`}>{formatCount(p.winsCount)}</td><td className={`${tdClass} text-[#666666]`}>{p.lastRealActivityLabel}</td><td className={tdClass}><span className={`inline-flex rounded-full px-3 py-[4px] text-[11px] font-medium ${getPlatformBadgeClasses(platform)}`}>{platform}</span></td><td className={tdClass}><Link href={`/admin/joueurs/${p.id}`} className="font-medium text-[#639922]">Voir →</Link></td></tr>; })}</tbody></table> : null}

            {tab === "referrals" ? <table className="min-w-full"><thead><tr className="border-b border-[#F0F0EC]">{["Rang", "Parrain", "Code", "Filleuls", "En attente", "Derniere utilisation", "Bonus", "Action"].map((label) => <th key={label} className={thClass}>{label}</th>)}</tr></thead><tbody>{rankedReferrers.map((r, i) => <tr key={r.userId} className="border-b border-[#F0F0EC] hover:bg-[#FAFAF8] last:border-b-0"><td className={tdClass} style={{ color: rankColor(i) }}><span className="font-medium">#{i + 1}</span></td><td className={tdClass}><div className="flex items-center gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FAEEDA] text-[12px] font-medium text-[#633806]">{getInitials(r.label)}</div><div><p className="font-medium">{r.label}</p><p className="text-[10.5px] text-[#999999]">{r.email.length > 28 ? `${r.email.slice(0, 27)}…` : r.email}</p></div></div></td><td className={tdClass}><code className="rounded-[6px] bg-[#F7F7F5] px-2 py-[2px] text-[12px]">{r.latestInviteCode || "—"}</code></td><td className={tdClass}><div className="space-y-2"><div>{formatCount(r.acceptedInviteesCount)}</div><div className="h-1 w-20 rounded-full bg-[#F0F0EC]"><div className="h-1 rounded-full bg-[#EF9F27]" style={{ width: barWidth(r.acceptedInviteesCount, referralsMax) }} /></div></div></td><td className={tdClass}>{formatCount(r.pendingReferralsCount)}</td><td className={`${tdClass} text-[#666666]`}>{r.lastAcceptedAtLabel}</td><td className={tdClass}><span className={`inline-flex rounded-full px-3 py-[4px] text-[11px] font-medium ${r.bonusStatus === "actif" ? "bg-[#EAF3DE] text-[#3B6D11]" : r.bonusStatus === "expire" ? "bg-[#F7F7F5] text-[#666666]" : "bg-[#FAFAF8] text-[#999999]"}`}>{r.bonusStatus === "actif" ? "Actif" : r.bonusStatus === "expire" ? "Expire" : "Aucun"}</span></td><td className={tdClass}><Link href={`/admin/parrainage/${r.userId}`} className="font-medium text-[#639922]">Voir →</Link></td></tr>)}</tbody></table> : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}
