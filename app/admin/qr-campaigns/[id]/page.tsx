"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { use, useCallback, useEffect, useState } from "react";
import { QrStatsPanel } from "@/components/admin/qr/QrStatsPanel";
import {
  QR_CAMPAIGN_STATUSES,
  QR_STATUS_LABELS,
  formatParisDateTimeInput,
  parisHourBucket,
  validateQrDestination,
  type QrCampaignStats,
  type QrCampaignStatus,
} from "@/lib/admin/qrCampaigns";
import type { QrCampaignView } from "@/lib/qr/qrCampaignAdmin";
import { qrApi, qrApiError } from "@/lib/qr/qrCampaignClient";

type Change = { id: string; at: string | null; by: string; kind: string; changes: Record<string, unknown> };

const input = "h-[38px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[12.5px] text-[#1A1A1A] outline-none";
const FIELD_LABELS: Record<string, string> = {
  name: "Nom", destination_url: "Destination", status: "Statut", launch_at: "Lancement", channel: "Canal", slug: "Chemin",
};

/** Resolution adaptee a l'impression et aux ecrans (marge de 4 modules). */
const QR_PNG_SIZE = 2048;

function shiftDay(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export default function QrCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<QrCampaignView | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ name: string; status: QrCampaignStatus; destinationUrl: string; launchAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const today = parisHourBucket(new Date()).date;
  const [period, setPeriod] = useState({ from: shiftDay(today, -29), to: today });
  const [stats, setStats] = useState<QrCampaignStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await qrApi(`/api/admin/qr-campaigns/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error(await qrApiError(response, "Campagne introuvable."));
      const body = (await response.json()) as { campaign: QrCampaignView; changes: Change[] };
      setCampaign(body.campaign);
      setChanges(body.changes);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Campagne introuvable.");
    }
  }, [id]);

  const loadStats = useCallback(async () => {
    setStatsError(null);
    try {
      const query = new URLSearchParams(period).toString();
      const response = await qrApi(`/api/admin/qr-campaigns/${encodeURIComponent(id)}/stats?${query}`);
      if (!response.ok) throw new Error(await qrApiError(response, "Statistiques indisponibles."));
      setStats(((await response.json()) as { stats: QrCampaignStats }).stats);
    } catch (statsLoadError) {
      setStats(null);
      setStatsError(statsLoadError instanceof Error ? statsLoadError.message : "Statistiques indisponibles.");
    }
  }, [id, period]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadStats(); }, [loadStats]);
  useEffect(() => {
    if (!campaign?.publicUrl) return;
    // Le QR encode l'URL publique, jamais la destination.
    void QRCode.toDataURL(campaign.publicUrl, { width: QR_PNG_SIZE, margin: 4, errorCorrectionLevel: "M" })
      .then(setQrImage).catch(() => setQrImage(null));
  }, [campaign?.publicUrl]);

  const save = async () => {
    if (!edit || !campaign) return;
    const problem = !edit.name.trim() ? "Nom obligatoire." : validateQrDestination(edit.destinationUrl);
    if (problem) { setError(problem); return; }
    if (edit.status === "active" && campaign.status !== "active" &&
        !window.confirm(`Activer « ${campaign.name} » ? Les ouvertures de ${campaign.publicUrl} seront comptées.`)) return;
    setBusy(true);
    try {
      const response = await qrApi(`/api/admin/qr-campaigns/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: edit.name, status: edit.status, destinationUrl: edit.destinationUrl, launchAt: edit.launchAt || null }),
      });
      if (!response.ok) throw new Error(await qrApiError(response, "Enregistrement impossible."));
      setEdit(null);
      setMessage("Modifications enregistrées. L'URL et le QR code ne changent pas.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  if (!campaign) {
    return <section className="p-6">{error ? <p role="alert" className="feedback error">{error}</p> : <p className="text-[#666]">Chargement...</p>}</section>;
  }

  return (
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto grid max-w-[1100px] gap-6">
        <div>
          <Link href="/admin/qr-campaigns" className="text-[12px] text-[#666] underline">← Campagnes QR</Link>
          <h1 className="mt-1 text-[22px] font-medium">{campaign.name}</h1>
          <p className="text-sm text-[#666]">{QR_STATUS_LABELS[campaign.status]} · identifiant {campaign.id}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="grid content-start gap-3 rounded-[12px] border border-[#E8E8E4] bg-white p-5">
            <p className="text-[12px] text-[#999]">URL publique (encodée dans le QR code, ne change jamais)</p>
            <code data-testid="qr-public-url" className="text-[15px] font-medium">{campaign.publicUrl}</code>
            {!edit ? (
              <>
                <p className="text-[12px] text-[#999]">Destination actuelle</p>
                <p className="break-all text-[13px]" data-testid="qr-destination">{campaign.destinationUrl}</p>
                <p className="text-[12px] text-[#666]">Lancement : {campaign.launchAt ? new Date(campaign.launchAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "non défini"}</p>
                <button type="button" onClick={() => { setError(null); setMessage(null); setEdit({ name: campaign.name, status: campaign.status, destinationUrl: campaign.destinationUrl, launchAt: formatParisDateTimeInput(campaign.launchAt ? new Date(campaign.launchAt) : null) }); }}
                  className="w-fit rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-2 text-[12px] text-[#666]">Modifier</button>
              </>
            ) : (
              <div className="grid gap-3" data-testid="qr-edit-form">
                <label className="flex flex-col gap-1"><span className="text-[11px] text-[#666]">Nom</span>
                  <input aria-label="Nom" className={input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] text-[#666]">Statut</span>
                  <select aria-label="Statut" className={input} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as QrCampaignStatus })}>
                    {QR_CAMPAIGN_STATUSES.map((status) => <option key={status} value={status}>{QR_STATUS_LABELS[status]}</option>)}
                  </select></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] text-[#666]">Destination (le QR code reste identique)</span>
                  <input aria-label="Destination" className={input} value={edit.destinationUrl} onChange={(e) => setEdit({ ...edit, destinationUrl: e.target.value })} /></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] text-[#666]">Lancement (heure de Paris)</span>
                  <input aria-label="Lancement" type="datetime-local" className={input} value={edit.launchAt} onChange={(e) => setEdit({ ...edit, launchAt: e.target.value })} /></label>
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void save()} className="rounded-[8px] bg-[#639922] px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50">{busy ? "Enregistrement..." : "Enregistrer"}</button>
                  <button type="button" disabled={busy} onClick={() => setEdit(null)} className="rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-2 text-[12px] text-[#666]">Annuler</button>
                </div>
              </div>
            )}
            {message ? <p className="text-[12px] text-[#639922]">{message}</p> : null}
            {error ? <p role="alert" className="text-[12px] text-[#C0392B]">{error}</p> : null}
          </div>
          <div className="grid content-start justify-items-center gap-2 rounded-[12px] border border-[#E8E8E4] bg-white p-5">
            {qrImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img data-testid="qr-image" src={qrImage} alt={`QR code de ${campaign.publicUrl}`} width={220} height={220} />
                <a href={qrImage} download={`qr-${campaign.id}-${QR_PNG_SIZE}px.png`} className="rounded-[8px] bg-[#639922] px-4 py-2 text-[12px] font-medium text-white">
                  Télécharger le PNG ({QR_PNG_SIZE} px)
                </a>
              </>
            ) : <p className="text-[12px] text-[#666]">Génération du QR code...</p>}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <h2 className="mr-auto text-[17px] font-medium">Statistiques</h2>
            {[7, 30, 90].map((days) => (
              <button key={days} type="button" onClick={() => setPeriod({ from: shiftDay(today, -(days - 1)), to: today })}
                className="rounded-[8px] border border-[#E8E8E4] bg-white px-3 py-1.5 text-[12px] text-[#666]">{days} jours</button>
            ))}
            <label className="flex flex-col text-[11px] text-[#666]">Du<input aria-label="Du" type="date" className={input} value={period.from} onChange={(e) => e.target.value && setPeriod({ ...period, from: e.target.value })} /></label>
            <label className="flex flex-col text-[11px] text-[#666]">Au<input aria-label="Au" type="date" className={input} value={period.to} onChange={(e) => e.target.value && setPeriod({ ...period, to: e.target.value })} /></label>
          </div>
          {statsError ? <p role="alert" className="text-[12px] text-[#C0392B]">{statsError}</p> : null}
          {stats ? <QrStatsPanel stats={stats} /> : !statsError ? <p className="text-[12px] text-[#666]">Chargement...</p> : null}
        </div>

        <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
          <h2 className="mb-2 text-[15px] font-medium">Historique des modifications</h2>
          <ul className="grid gap-2 text-[12px]" data-testid="qr-changes">
            {changes.map((change) => (
              <li key={change.id} className="rounded-[8px] bg-[#F7F7F5] px-3 py-2">
                <span className="text-[#999]">{change.at ? new Date(change.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "—"} · {change.by}</span>
                <span className="block">
                  {change.kind === "created" ? "Création" : Object.entries(change.changes)
                    .map(([field, value]) => `${FIELD_LABELS[field] ?? field} : ${String((value as { from?: unknown })?.from ?? "—")} → ${String((value as { to?: unknown })?.to ?? "—")}`)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
