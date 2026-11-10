"use client";

import { formatQrPercent, type QrCampaignStats } from "@/lib/admin/qrCampaigns";

function dayLabel(day: string) {
  const [, month, date] = day.split("-");
  return `${date}/${month}`;
}

/** Graphique en barres (SVG), sans dependance supplementaire. */
function Bars({ values, labels, testId, height = 140 }: { values: number[]; labels: string[]; testId: string; height?: number }) {
  const max = Math.max(1, ...values);
  const width = Math.max(values.length * 14, 280);
  const bar = width / Math.max(values.length, 1);
  const step = Math.max(1, Math.ceil(values.length / 10));
  return (
    <svg data-testid={testId} viewBox={`0 0 ${width} ${height + 18}`} className="h-auto w-full" role="img"
      aria-label={labels.map((label, index) => `${label} : ${values[index]}`).join(", ")}>
      {values.map((value, index) => {
        const barHeight = value ? Math.max(2, (value / max) * height) : 0;
        return (
          <g key={labels[index]}>
            <rect x={index * bar + 1} y={height - barHeight} width={Math.max(bar - 2, 1)} height={barHeight} fill="#639922" rx={2}>
              <title>{`${labels[index]} : ${value}`}</title>
            </rect>
            {index % step === 0 ? <text x={index * bar + bar / 2} y={height + 13} textAnchor="middle" fontSize={9} fill="#999">{labels[index]}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

export function QrStatsPanel({ stats }: { stats: QrCampaignStats }) {
  const { totals, devices } = stats;
  const kpis = [
    { label: "Ouvertures enregistrées", value: totals.opens, hint: "Hors robots et rafales, campagne active" },
    { label: "Robots et aperçus écartés", value: totals.excluded_automated, hint: "Redirigés, non comptés" },
    { label: "Hors période de campagne", value: totals.outside_campaign, hint: "Avant lancement ou campagne inactive" },
    { label: "Redirections de secours", value: totals.fallback_redirects, hint: "Destination de repli (lecture impossible)" },
  ];
  return (
    <div className="grid gap-4" data-testid="qr-stats">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-[12px] border border-[#E8E8E4] bg-white p-4">
            <p className="text-[11px] text-[#999]">{kpi.label}</p>
            <p className="text-[22px] font-medium text-[#1a1a1a]">{kpi.value.toLocaleString("fr-FR")}</p>
            <p className="text-[11px] text-[#999]">{kpi.hint}</p>
          </div>
        ))}
      </div>
      <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-4">
        <h3 className="mb-2 text-[13px] font-medium">Ouvertures par jour</h3>
        <Bars testId="qr-daily-chart" values={stats.daily.map((day) => day.opens)} labels={stats.daily.map((day) => dayLabel(day.date))} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-4">
          <h3 className="mb-2 text-[13px] font-medium">Répartition par heure (Paris)</h3>
          <Bars testId="qr-hourly-chart" values={stats.hourly} labels={stats.hourly.map((_, hour) => `${hour}h`)} height={100} />
        </div>
        <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-4" data-testid="qr-devices">
          <h3 className="mb-2 text-[13px] font-medium">Appareils estimés</h3>
          {([["iPhone / iPad", devices.ios], ["Android", devices.android], ["Autres", devices.other]] as const).map(([label, value]) => (
            <div key={label} className="mb-2">
              <div className="flex justify-between text-[12px]"><span>{label}</span><span>{value.toLocaleString("fr-FR")} · {formatQrPercent(value, totals.opens)}</span></div>
              <div className="h-2 rounded bg-[#F0F0EC]"><div className="h-2 rounded bg-[#639922]" style={{ width: formatQrPercent(value, totals.opens).replace(" ", "") }} /></div>
            </div>
          ))}
          <p className="mt-2 text-[11px] text-[#999]">Estimation d&apos;après le navigateur annoncé (non enregistré). Un iPad récent peut apparaître dans « Autres ».</p>
        </div>
      </div>
      <p className="text-[11px] text-[#999]">
        Ces chiffres sont des ouvertures de l&apos;URL : une même personne peut être comptée plusieurs fois, et une
        ouverture n&apos;est ni un téléchargement ni une installation.
      </p>
    </div>
  );
}
