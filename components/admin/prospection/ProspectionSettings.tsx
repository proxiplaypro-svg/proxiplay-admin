"use client";
import { useRef, useState } from "react";
import { emailRequest } from "@/lib/prospection/emailClient";
import s from "@/app/admin/prospection/prospection.module.css";

type Settings = { download_url: string; website_url: string; sender_name: string; signature: string; phone: string; audience_metric: string; audience_metric_source: string; commercial_price_label: string; initial_email_subject: string; initial_email_body: string; follow_up_email_subject: string; follow_up_email_body: string };
type Data = { settings: Settings; revision: number };

export function ProspectionSettings() {
  const [data, setData] = useState<Data | null>(null); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [notice, setNotice] = useState(""); const [error, setError] = useState("");
  async function run(work: () => Promise<void>) { if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice(""); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Opération échouée."); } finally { lock.current = false; setBusy(false); } }
  async function load() { setData(await emailRequest<Data>({ action: "settings_get" })); }
  const update = (patch: Partial<Settings>) => data && setData({ ...data, settings: { ...data.settings, ...patch } });
  return <section className={s.panel}>
    <h2>Paramètres commerciaux</h2><button disabled={busy} onClick={() => void run(load)}>{data ? "Recharger les paramètres" : "Configurer la prospection"}</button>
    {error && <p role="alert" className={s.error}>{error}</p>}{notice && <p role="status">{notice}</p>}
    {data && <form className={s.module} onSubmit={e => { e.preventDefault(); void run(async () => { const saved = await emailRequest<Data>({ action: "settings_save", settings: data.settings, revision: data.revision }); setData(saved); setNotice("Paramètres enregistrés. Ils s’appliqueront seulement aux prochains brouillons."); }); }}>
      <h3>Éléments commerciaux facultatifs</h3><p className={s.muted}>Aucun chiffre n’est inséré sans configuration explicite. L’indicateur exige une source HTTPS vérifiable.</p>
      <label>Indicateur d’audience sourcé<input maxLength={500} disabled={busy} value={data.settings.audience_metric} onChange={e => update({ audience_metric: e.target.value })} placeholder="Ex. moyenne mensuelle vérifiée" /></label>
      <label>Source HTTPS de l’indicateur<input type="url" maxLength={2000} disabled={busy} value={data.settings.audience_metric_source} onChange={e => update({ audience_metric_source: e.target.value })} placeholder="https://…" /></label>
      <label>Tarif commercial indicatif<input maxLength={200} disabled={busy} value={data.settings.commercial_price_label} onChange={e => update({ commercial_price_label: e.target.value })} placeholder="Ex. Sur devis" /></label>
      {([['download_url', 'Lien de téléchargement'], ['website_url', 'Site Proxiplay']] as const).map(([key, label]) => <label key={key}>{label}<input required type="url" maxLength={2000} disabled={busy} value={data.settings[key]} onChange={e => update({ [key]: e.target.value })} /></label>)}
      <h3>Modèle du premier email</h3><label>Objet<input required maxLength={200} disabled={busy} value={data.settings.initial_email_subject} onChange={e => update({ initial_email_subject: e.target.value })} /></label><label>Message<textarea required maxLength={10000} rows={12} disabled={busy} value={data.settings.initial_email_body} onChange={e => update({ initial_email_body: e.target.value })} /></label>
      <h3>Modèle de relance</h3><p className={s.muted}>Utilisé seulement lors d’une génération explicite de relance. Aucun envoi automatique.</p><label>Objet de relance<input required maxLength={200} disabled={busy} value={data.settings.follow_up_email_subject} onChange={e => update({ follow_up_email_subject: e.target.value })} /></label><label>Message de relance<textarea required maxLength={10000} rows={10} disabled={busy} value={data.settings.follow_up_email_body} onChange={e => update({ follow_up_email_body: e.target.value })} /></label>
      <label>Nom du signataire<input required maxLength={500} disabled={busy} value={data.settings.sender_name} onChange={e => update({ sender_name: e.target.value })} /></label><label>Signature<input required maxLength={500} disabled={busy} value={data.settings.signature} onChange={e => update({ signature: e.target.value })} /></label><label>Téléphone commercial<input type="tel" maxLength={50} disabled={busy} value={data.settings.phone} onChange={e => update({ phone: e.target.value })} /></label>
      <button disabled={busy}>Enregistrer les paramètres</button>
    </form>}
  </section>;
}
