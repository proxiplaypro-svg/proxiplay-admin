"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase/auth";
import { getAdCampaignStatus, type AdCampaignRecord, type AdPlacement } from "@/lib/admin/adCampaign";
import { getAdImageFormat, isAdImageRatioCompatible } from "@/lib/admin/adImageFormat";

type Form = {
  id: string | null; sourceCampaignId: string | null; name: string; advertiser: string;
  placement: AdPlacement; imageUrl: string; destinationUrl: string; startDate: string;
  endDate: string; frequencyCapHours: string;
};
type ImageDimensions = { width: number; height: number };

const EMPTY: Form = { id: null, sourceCampaignId: null, name: "", advertiser: "", placement: "home_banner", imageUrl: "", destinationUrl: "", startDate: "", endDate: "", frequencyCapHours: "" };
const LABEL = { draft: "Brouillon", scheduled: "Programmée", active: "Active", ended: "Terminée", disabled: "Désactivée" } as const;
const date = (value: string) => value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`)) : "—";
const ctr = (impressions: number, clicks: number) => impressions ? `${((clicks / impressions) * 100).toFixed(1)} %` : "—";

function clone(campaign: AdCampaignRecord, relaunch = false): Form {
  return { id: null, sourceCampaignId: campaign.id, name: `${campaign.name}${relaunch ? " — relance" : " — copie"}`, advertiser: campaign.advertiser, placement: campaign.placement, imageUrl: campaign.imageUrl, destinationUrl: campaign.destinationUrl, startDate: relaunch ? "" : campaign.startDate, endDate: relaunch ? "" : campaign.endDate, frequencyCapHours: campaign.frequencyCapHours };
}

async function token() {
  const user = auth.currentUser;
  if (!user) throw new Error("Connexion administrateur requise.");
  return user.getIdToken();
}

async function request(url: string, options: RequestInit = {}) {
  return fetch(url, { ...options, headers: { ...(options.headers as Record<string, string> | undefined), Authorization: `Bearer ${await token()}` } });
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error?.trim() || fallback;
}

function readImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(objectUrl); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Impossible de lire les dimensions de cette image.")); };
    image.src = objectUrl;
  });
}

function ImageFormatHelp({ placement }: { placement: AdPlacement }) {
  const format = getAdImageFormat(placement);
  return <p className="text-sm text-[#666]">Format recommandé : {format.width} × {format.height} px ({format.ratioLabel})</p>;
}

function Editor({ form, change, close, saved }: { form: Form; change: (next: Form) => void; close: () => void; saved: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions | null>(null);
  const format = getAdImageFormat(form.placement);
  const compatible = imageDimensions === null ? null : isAdImageRatioCompatible(form.placement, imageDimensions.width, imageDimensions.height);

  useEffect(() => { setImageDimensions(null); }, [form.id, form.sourceCampaignId]);

  const payload = () => ({ name: form.name, advertiser: form.advertiser, placement: form.placement, image_url: form.imageUrl, destination_url: form.destinationUrl, start_date: form.startDate, end_date: form.endDate, frequency_cap_hours: form.placement === "open" ? form.frequencyCapHours : null, source_campaign_id: form.sourceCampaignId });

  const upload = async (file?: File) => {
    if (!file) return;
    if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type)) { setError("Choisissez une image JPG, PNG ou WebP."); return; }
    setUploading(true); setError(null);
    try {
      setImageDimensions(await readImageDimensions(file));
      const data = new FormData();
      data.append("file", file);
      data.append("path", `ads/${form.placement}/${Date.now()}.${file.name.split(".").pop()?.toLowerCase() || "jpg"}`);
      const response = await request("/api/admin/upload", { method: "POST", body: data });
      const result = await response.json().catch(() => null) as { url?: string; error?: string } | null;
      if (!response.ok || !result?.url) throw new Error(result?.error || "Impossible d’envoyer l’image.");
      change({ ...form, imageUrl: result.url });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Envoi impossible."); } finally { setUploading(false); }
  };

  const save = async (publish: boolean) => {
    setBusy(true); setError(null);
    try {
      let id = form.id;
      if (!id) {
        const response = await request("/api/admin/ad-campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
        if (!response.ok) throw new Error(await responseError(response, "Création impossible."));
        id = (await response.json() as { id: string }).id;
      } else {
        const response = await request(`/api/admin/ad-campaigns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
        if (!response.ok) throw new Error(await responseError(response, "Modification impossible."));
      }
      if (publish) {
        const response = await request(`/api/admin/ad-campaigns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload(), action: "publish" }) });
        if (!response.ok) throw new Error(await responseError(response, "Publication impossible."));
      }
      await saved(); close();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Enregistrement impossible."); } finally { setBusy(false); }
  };

  return <section className="rounded-xl border border-[#dfe4d8] bg-white p-6">
    <div className="flex justify-between gap-3"><div><h2 className="text-lg font-semibold">{form.id ? "Modifier la campagne" : "Nouvelle publicité"}</h2><p className="mt-1 text-sm text-[#666]">Un brouillon ne s’affiche jamais dans l’application. La publication est explicite.</p></div><button onClick={close} className="text-sm">Fermer</button></div>
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <label className="grid gap-1 text-sm">Nom de campagne<input value={form.name} onChange={(event) => change({ ...form, name: event.target.value })} className="rounded border px-3 py-2" /></label>
      <label className="grid gap-1 text-sm">Annonceur<input value={form.advertiser} onChange={(event) => change({ ...form, advertiser: event.target.value })} className="rounded border px-3 py-2" /></label>
      <label className="grid gap-1 text-sm">Emplacement<select value={form.placement} onChange={(event) => change({ ...form, placement: event.target.value as AdPlacement, frequencyCapHours: event.target.value === "open" ? form.frequencyCapHours : "" })} className="rounded border px-3 py-2"><option value="home_banner">Bandeau Home</option><option value="open">Publicité d’ouverture</option></select><ImageFormatHelp placement={form.placement} /></label>
      <label className="grid gap-1 text-sm">Destination au clic (URL)<input type="url" value={form.destinationUrl} onChange={(event) => change({ ...form, destinationUrl: event.target.value })} className="rounded border px-3 py-2" /></label>
      <label className="grid gap-1 text-sm">Début<input type="date" value={form.startDate} onChange={(event) => change({ ...form, startDate: event.target.value })} className="rounded border px-3 py-2" /></label>
      <label className="grid gap-1 text-sm">Fin<input type="date" value={form.endDate} onChange={(event) => change({ ...form, endDate: event.target.value })} className="rounded border px-3 py-2" /></label>
      {form.placement === "open" && <label className="grid gap-1 text-sm">Fréquence (heures)<input type="number" min="0" value={form.frequencyCapHours} onChange={(event) => change({ ...form, frequencyCapHours: event.target.value })} className="rounded border px-3 py-2" /><span className="text-xs text-[#666]">0 = à chaque ouverture de l&apos;application</span></label>}
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,280px)_1fr] sm:items-center">
      <div className="flex w-full items-center justify-center overflow-hidden rounded border bg-[#f7f7f5] text-xs text-[#777]" style={{ aspectRatio: format.cssAspectRatio }}>{form.imageUrl ? <img src={form.imageUrl} alt="Aperçu de la publicité" className="h-full w-full object-cover" /> : "Aucune image"}</div>
      <div className="grid gap-2"><ImageFormatHelp placement={form.placement} /><button type="button" disabled={uploading} onClick={() => input.current?.click()} className="w-fit rounded border px-3 py-2 text-sm">{uploading ? "Envoi…" : "Importer une image"}</button><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void upload(file); }} />
        {imageDimensions && <p className={`text-sm ${compatible ? "text-[#3b6d11]" : "text-amber-800"}`}>Image : {imageDimensions.width} × {imageDimensions.height} px — {compatible ? "format conforme" : `ratio non recommandé pour ${form.placement === "open" ? "une publicité d’ouverture" : "le bandeau Home"}`}</p>}
        {compatible === false && <p className="text-sm text-amber-800">L’image est conservée, mais elle pourra être recadrée ou afficher des bandes dans l’application.</p>}
      </div>
    </div>
    {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
    <div className="mt-5 flex gap-3"><button disabled={busy || uploading} onClick={() => void save(false)} className="rounded bg-[#e8ece4] px-4 py-2 text-sm">Enregistrer le brouillon</button><button disabled={busy || uploading} onClick={() => void save(true)} className="rounded bg-[#639922] px-4 py-2 text-sm text-white">{busy ? "Traitement…" : "Publier"}</button></div>
  </section>;
}

export default function AdminPublicitePage() {
  const [campaigns, setCampaigns] = useState<AdCampaignRecord[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const response = await request("/api/admin/ad-campaigns"); if (!response.ok) throw new Error(await responseError(response, "Impossible de charger les campagnes.")); setCampaigns((await response.json() as { campaigns: AdCampaignRecord[] }).campaigns); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Chargement impossible."); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const deactivate = async (campaign: AdCampaignRecord) => {
    setBusy(campaign.id);
    try { const response = await request(`/api/admin/ad-campaigns/${campaign.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deactivate" }) }); if (!response.ok) throw new Error(await responseError(response, "Désactivation impossible.")); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Action impossible."); } finally { setBusy(null); }
  };
  return <section className="min-h-full bg-[#F7F7F5]"><div className="mx-auto grid max-w-[1100px] gap-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-[22px] font-medium">Publicités</h1><p className="mt-1 text-sm text-[#666]">Historique complet des campagnes. L’application conserve ses documents actifs <code>ads/open</code> et <code>ads/home_banner</code>.</p></div><button onClick={() => setForm(EMPTY)} className="rounded bg-[#639922] px-4 py-2 text-sm text-white">Nouvelle publicité</button></div>
    {form && <Editor form={form} change={setForm} close={() => setForm(null)} saved={load} />}{error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading ? <p className="text-sm text-[#666]">Chargement des campagnes…</p> : campaigns.length === 0 ? <div className="rounded-xl border border-dashed bg-white p-8 text-sm text-[#666]">Aucune campagne enregistrée.</div> : <div className="grid gap-3">{campaigns.map((campaign) => { const status = getAdCampaignStatus(campaign); return <article key={campaign.id} className="grid gap-4 rounded-xl border border-[#e4e7df] bg-white p-4 md:grid-cols-[112px_1fr_auto]"><div className="flex h-20 w-28 items-center justify-center overflow-hidden rounded bg-[#f7f7f5] text-xs text-[#777]">{campaign.imageUrl ? <img src={campaign.imageUrl} alt="" className="h-full w-full object-cover" /> : "Aucune image"}</div><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-medium">{campaign.name}</h2><span className="rounded-full bg-[#edf1e8] px-2 py-0.5 text-xs">{LABEL[status]}</span><span className="text-xs text-[#666]">{campaign.placement === "open" ? "Ouverture" : "Bandeau Home"}</span></div><p className="mt-1 text-sm text-[#555]">{campaign.advertiser} · {date(campaign.startDate)} — {date(campaign.endDate)}</p><div className="mt-2 flex gap-4 text-xs text-[#666]"><span>{campaign.impressions} impressions</span><span>{campaign.clicks} clics</span><span>CTR {ctr(campaign.impressions, campaign.clicks)}</span></div></div><div className="flex flex-wrap content-start gap-2 md:max-w-[240px]"><button onClick={() => setForm({ ...clone(campaign), id: campaign.id, name: campaign.name, sourceCampaignId: campaign.sourceCampaignId, startDate: campaign.startDate, endDate: campaign.endDate })} className="rounded border px-2 py-1 text-xs">Voir / Modifier</button><button onClick={() => setForm(clone(campaign))} className="rounded border px-2 py-1 text-xs">Dupliquer</button><button onClick={() => setForm(clone(campaign, true))} className="rounded border px-2 py-1 text-xs">Relancer</button>{status !== "disabled" && <button disabled={busy === campaign.id} onClick={() => void deactivate(campaign)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-700">Désactiver</button>}</div></article>; })}</div>}
  </div></section>;
}
