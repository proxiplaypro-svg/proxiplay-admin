"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { formatChartDay, formatChartValue, type ChartUnit as Unit, type ReliableDashboardMetricKey, type ReliableDashboardSnapshot } from "@/lib/admin/reliableDashboard";

const labels: Array<[ReliableDashboardMetricKey, string]> = [
  ["registeredPlayers", "Joueurs inscrits"], ["playersYesterday", "Joueurs hier"],
  ["participationsYesterday", "Parties hier"],
  ["merchantsWithActiveGame", "Enseignes avec jeu en cours"], ["activeGames", "Jeux en cours"],
];

type ActiveBar = { chart: string; day: string } | null;
function DailyChart({ title, color, unit, values, activeDay, onActivate }: { title: string; color: string; unit: Unit; values: Array<{ day: string; value: number }>; activeDay: string | null; onActivate: (day: string | null) => void }) {
  const maximum = Math.max(1, ...values.map((item) => item.value));
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  // Roving focus: one tab stop per chart, arrows move between days.
  const [focusIndex, setFocusIndex] = useState(values.length - 1);
  // Pointer type of the press in progress: a touch toggles, a mouse click shows.
  const pressedWith = useRef<string | null>(null);
  const activeIndex = values.findIndex((item) => item.day === activeDay);
  const active = activeIndex >= 0 ? values[activeIndex] : null;
  const heightOf = (value: number) => Math.max(2, value / maximum * 100);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { onActivate(null); return; }
    const next = { ArrowLeft: focusIndex - 1, ArrowRight: focusIndex + 1, Home: 0, End: values.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const index = Math.min(values.length - 1, Math.max(0, next));
    setFocusIndex(index); buttons.current[index]?.focus();
  }

  // The tooltip stays inside the chart: anchored left on the first days, right on the last ones.
  const tooltipPosition = active ? (() => {
    const n = values.length; const edge = Math.max(1, Math.round(n * 0.15));
    const [left, shift] = activeIndex < edge ? [activeIndex / n * 100, "0%"] : activeIndex >= n - edge ? [(activeIndex + 1) / n * 100, "-100%"] : [(activeIndex + 0.5) / n * 100, "-50%"];
    return { left: `${left}%`, transform: `translateX(${shift})`, bottom: `calc(${Math.min(heightOf(active.value), 70)}% + 1.25rem)` };
  })() : null;

  return <section className="min-w-0 rounded-xl border border-[#E8E8E4] bg-white p-4"><h2 className="text-base font-medium">{title}</h2><p className="mt-1 text-xs text-[#777]">30 dernières journées civiles closes — Europe/Paris.</p>
    {/* Each column has a definite height (h-full of h-44), so the bar's percentage
        height resolves; a day label every 5 days, ending at the last day, fits 390px. */}
    <div data-chart-bars role="group" aria-label={`${title}, ${values.length} derniers jours. Flèches gauche et droite pour changer de jour.`} onKeyDown={onKeyDown} className="relative mt-5 flex h-44 items-end gap-px sm:gap-1">
      {values.map((item, index) => {
        const label = `${formatChartDay(item.day)} : ${formatChartValue(item.value, unit)}`;
        return <button key={item.day} ref={(element) => { buttons.current[index] = element; }} type="button" tabIndex={index === focusIndex ? 0 : -1} aria-label={label}
          onPointerDown={(event) => { pressedWith.current = event.pointerType; }}
          onPointerEnter={(event) => { if (event.pointerType === "mouse") onActivate(item.day); }}
          onPointerLeave={(event) => { if (event.pointerType === "mouse" && item.day === activeDay) onActivate(null); }}
          onFocus={() => { setFocusIndex(index); if (!pressedWith.current) onActivate(item.day); }}
          onBlur={() => { if (item.day === activeDay) onActivate(null); }}
          onClick={() => { const pointer = pressedWith.current; pressedWith.current = null; onActivate(pointer !== "mouse" && pointer !== null && item.day === activeDay ? null : item.day); }}
          className="flex h-full min-w-0 flex-1 cursor-pointer flex-col rounded-t outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A] focus-visible:ring-offset-1">
          <span className="relative block w-full flex-1"><span data-chart-bar className="absolute inset-x-0 bottom-0 block rounded-t transition-[filter]" style={{ height: `${heightOf(item.value)}%`, backgroundColor: color, filter: item.day === activeDay ? "brightness(0.8)" : undefined }} /></span>
          <span aria-hidden="true" className="mt-1 block h-3 w-full whitespace-nowrap text-center text-[9px] leading-3 text-[#777]">{(values.length - 1 - index) % 5 === 0 ? item.day.slice(8) : ""}</span>
        </button>;
      })}
      {/* Visual only (the focused button already carries the same accessible label); never intercepts clicks. */}
      {active && tooltipPosition ? <div data-chart-tooltip aria-hidden="true" className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md bg-[#1A1A1A] px-2.5 py-1.5 text-xs text-white shadow-lg" style={tooltipPosition}><span className="block text-[#D8D8D2]">{formatChartDay(active.day)}</span><strong className="block text-sm font-medium">{formatChartValue(active.value, unit)}</strong></div> : null}
    </div>
    {values.length === 0 ? <p className="py-8 text-sm text-[#777]">Donnée indisponible.</p> : null}</section>;
}

export default function ReliableDashboard({ data }: { data: ReliableDashboardSnapshot }) {
  // One tooltip for the whole dashboard, whichever chart it belongs to.
  const [active, setActive] = useState<ActiveBar>(null);
  useEffect(() => {
    if (!active) return;
    // A tap or click outside the bars closes it (touch screens never "leave" a bar).
    const close = (event: PointerEvent) => { if (!(event.target instanceof Element && event.target.closest("[data-chart-bars]"))) setActive(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [active]);
  const players = data.daily.flatMap((item) => item.uniquePlayers === null ? [] : [{ day: item.day, value: item.uniquePlayers }]); const plays = data.daily.flatMap((item) => item.participations === null ? [] : [{ day: item.day, value: item.participations }]);
  const chart = (title: string, color: string, unit: Unit, values: typeof players) => <DailyChart title={title} color={color} unit={unit} values={values} activeDay={active?.chart === title ? active.day : null} onActivate={(day) => setActive(day ? { chart: title, day } : null)} />;
  return <section className="space-y-5 text-[#1A1A1A]"><header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-[22px] font-medium">Tableau de bord</h1><p className="mt-1 text-[13px] text-[#777]">{data.referenceDate ? `Statistiques arrêtées au ${data.referenceDate.split("-").reverse().join("/")}.` : "Statistiques en attente de consolidation"}</p></div><Link href="/admin/dashboard/complet" className="text-[13px]">{/* Inner span: the global `a { color: inherit }` rule outranks utilities set on the link itself. */}<span className="text-[#3B6D11] underline">Alertes, jeux et marchands à relancer</span></Link></header><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{labels.map(([key, label]) => <article key={key} className="rounded-xl border border-[#E8E8E4] bg-white p-4"><p className="text-xs text-[#777]">{label}</p><strong className="mt-2 block text-2xl">{data.metrics[key] !== null ? data.metrics[key]!.toLocaleString("fr-FR") : "Donnée indisponible"}</strong></article>)}</div><div className="grid gap-5 xl:grid-cols-2">{chart("Joueurs quotidiens", "#2F6FED", { one: "joueur unique", many: "joueurs uniques" }, players)}{chart("Parties quotidiennes", "#639922", { one: "partie jouée", many: "parties jouées" }, plays)}</div></section>;
}
