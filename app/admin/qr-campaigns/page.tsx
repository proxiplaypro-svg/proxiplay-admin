"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_APP_DESTINATION,
  QR_CAMPAIGN_CHANNELS,
  QR_CHANNEL_LABELS,
  QR_STATUS_LABELS,
  QR_VANITY_SLUGS,
  isValidQrCampaignId,
  qrPublicUrl,
  validateQrDestination,
  validateQrSlug,
  type QrCampaignChannel,
} from "@/lib/admin/qrCampaigns";
import type { QrCampaignView } from "@/lib/qr/qrCampaignAdmin";
import { qrApi, qrApiError } from "@/lib/qr/qrCampaignClient";

const input = "h-[38px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[12.5px] text-[#1A1A1A] outline-none";
const EMPTY = { id: "", name: "", slug: "", destinationUrl: DEFAULT_APP_DESTINATION, channel: "autre" as QrCampaignChannel, launchAt: "" };

export default function QrCampaignsPage() {
  const [campaigns, setCampaigns] = useState<QrCampaignView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await qrApi("/api/admin/qr-campaigns");
      if (!response.ok) throw new Error(await qrApiError(response, "Impossible de charger les campagnes."));
      setCampaigns(((await response.json()) as { campaigns: QrCampaignView[] }).campaigns);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger les campagnes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!form) return;
    const problem = !isValidQrCampaignId(form.id)
      ? "Identifiant invalide : minuscules, chiffres et _, 3 à 40 caractères (ex. bus_dunkerque)."
      : !form.name.trim() ? "Nom obligatoire."
      : validateQrSlug(form.slug) ?? validateQrDestination(form.destinationUrl);
    setFormError(problem);
    if (problem) return;
    setBusy(true);
    try {
      const response = await qrApi("/api/admin/qr-campaigns", {
        method: "POST",
        body: JSON.stringify({ ...form, launchAt: form.launchAt || null }),
      });
      if (!response.ok) throw new Error(await qrApiError(response, "Création impossible."));
      setForm(null);
      await load();
    } catch (createError) {
      setFormError(createError instanceof Error ? createError.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto grid max-w-[1100px] gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-medium">Campagnes QR</h1>
            <p className="mt-1 max-w-[760px] text-sm text-[#666]">
              Une URL stable par campagne (bus, flyers, affiches…), encodée dans le QR code et redirigée vers sa
              destination. Les statistiques comptent des <strong>ouvertures</strong> de cette URL, sans cookie ni
              identifiant : ni visiteurs uniques, ni téléchargements, ni installations.
            </p>
          </div>
          <button type="button" onClick={() => { setForm(EMPTY); setFormError(null); }} className="rounded bg-[#639922] px-4 py-2 text-sm text-white">
            Nouvelle campagne
          </button>
        </div>

        {form ? (
          <div className="grid gap-3 rounded-[12px] border border-[#E8E8E4] bg-white p-5" data-testid="qr-campaign-form">
            <h2 className="text-[15px] font-medium">Nouvelle campagne</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1"><span className="text-[11px] text-[#666]">Identifiant (définitif)</span>
                <input aria-label="Identifiant" className={input} value={form.id} placeholder="bus_dunkerque" onChange={(e) => setForm({ ...form, id: e.target.value.trim() })} /></label>
              <label className="flex flex-col gap-1"><span className="text-[11px] text-[#666]">Nom</span>
                <input aria-label="Nom" className={input} value={form.name} placeholder="Bus Dunkerque" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label className="flex flex-col gap-1"><span className="text-[11px] text-[#666]">Chemin public (définitif)</span>
                <input aria-label="Chemin" className={input} value={form.slug} placeholder="bus" onChange={(e) => setForm({ ...form, slug: e.target.value.trim().toLowerCase() })} />
                <span className="text-[11px] text-[#999]">URL du QR code : {form.slug ? qrPublicUrl(form.slug) : "—"}
                  {form.slug && !QR_VANITY_SLUGS.includes(form.slug) ? "" : form.slug ? " (chemin court déclaré sur le site)" : ""}</span></label>
              <label className="flex flex-col gap-1"><span className="text-[11px] text-[#666]">Canal</span>
                <select aria-label="Canal" className={input} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as QrCampaignChannel })}>
                  {QR_CAMPAIGN_CHANNELS.map((channel) => <option key={channel} value={channel}>{QR_CHANNEL_LABELS[channel]}</option>)}
                </select></label>
              <label className="flex flex-col gap-1 md:col-span-2"><span className="text-[11px] text-[#666]">Destination</span>
                <input aria-label="Destination" className={input} value={form.destinationUrl} onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })} /></label>
              <label className="flex flex-col gap-1"><span className="text-[11px] text-[#666]">Lancement (heure de Paris, facultatif)</span>
                <input aria-label="Lancement" type="datetime-local" className={input} value={form.launchAt} onChange={(e) => setForm({ ...form, launchAt: e.target.value })} /></label>
            </div>
            <p className="text-[11px] text-[#999]">La campagne est créée « {QR_STATUS_LABELS.draft} » : activez-la depuis sa fiche au lancement.</p>
            {formError ? <p role="alert" className="text-[12px] text-[#C0392B]">{formError}</p> : null}
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void create()} className="rounded-[8px] bg-[#639922] px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50">
                {busy ? "Création..." : "Créer la campagne"}
              </button>
              <button type="button" disabled={busy} onClick={() => setForm(null)} className="rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-2 text-[12px] text-[#666]">Annuler</button>
            </div>
          </div>
        ) : null}

        {error ? <p role="alert" className="feedback error">{error}</p> : null}
        <div className="overflow-x-auto rounded-[12px] border border-[#E8E8E4] bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#E8E8E4] text-left text-[11px] uppercase tracking-[0.06em] text-[#999]">
                <th className="px-4 py-3 font-medium">Campagne</th>
                <th className="px-4 py-3 font-medium">URL publique</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Destination</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={4} className="px-4 py-8 text-center text-[#666]">Chargement...</td></tr> : null}
              {!loading && !campaigns.length ? <tr><td colSpan={4} className="px-4 py-8 text-center text-[#999]">Aucune campagne pour le moment.</td></tr> : null}
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b border-[#F0F0EC] last:border-b-0">
                  <td className="px-4 py-3"><Link href={`/admin/qr-campaigns/${campaign.id}`} className="font-medium text-[#1a1a1a] underline">{campaign.name}</Link>
                    <span className="block text-[11px] text-[#999]">{QR_CHANNEL_LABELS[campaign.channel]} · {campaign.id}</span></td>
                  <td className="px-4 py-3"><code className="text-[12px]">{campaign.publicUrl}</code></td>
                  <td className="px-4 py-3">{QR_STATUS_LABELS[campaign.status]}</td>
                  <td className="max-w-[260px] truncate px-4 py-3 text-[#666]">{campaign.destinationUrl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
