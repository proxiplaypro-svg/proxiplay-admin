"use client";
import { useRef, useState } from "react";
import { emailRequest } from "@/lib/prospection/emailClient";
import s from "@/app/admin/prospection/prospection.module.css";

type Settings = { connections_per_day: number | null; download_url: string; website_url: string; sender_name: string; signature: string; phone: string; initial_email_subject: string; initial_email_body: string };
type Data = { settings: Settings; revision: number };

export function ProspectionSettings() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opération échouée.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function load() {
    setData(await emailRequest<Data>({ action: "settings_get" }));
  }

  return <section className={s.panel}>
    <h2>Paramètres commerciaux</h2>
    <button disabled={busy} onClick={() => void run(load)}>{data ? "Recharger les paramètres" : "Configurer la prospection"}</button>
    {error && <p role="alert" className={s.error}>{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {data && <form className={s.module} onSubmit={e => {
      e.preventDefault();
      void run(async () => {
        const saved = await emailRequest<Data>({ action: "settings_save", settings: data.settings, revision: data.revision });
        setData(saved);
        setNotice("Paramètres enregistrés. Ils seront utilisés à la prochaine génération ; les brouillons existants sont conservés.");
      });
    }}>
      <label>Connexions par jour<input type="number" min={0} max={1000000000} step={1} disabled={busy} value={data.settings.connections_per_day ?? ""} onChange={e => setData({ ...data, settings: { ...data.settings, connections_per_day: e.target.value === "" ? null : Number(e.target.value) } })} /></label>
      <p className={s.muted}>Laissez vide pour ne mentionner aucun chiffre de fréquentation.</p>
      {([['download_url', 'Lien de téléchargement'], ['website_url', 'Site Proxiplay']] as const).map(([key, label]) => <label key={key}>{label}<input required type="url" maxLength={2000} disabled={busy} value={data.settings[key]} onChange={e => setData({ ...data, settings: { ...data.settings, [key]: e.target.value } })} /></label>)}
      <h3>Modèle du premier email</h3>
      <p className={s.muted}>Ce modèle est utilisé pour créer les nouveaux brouillons. Vous pourrez encore modifier chaque email avant son envoi.</p>
      <label>Objet<input required maxLength={200} disabled={busy} value={data.settings.initial_email_subject} onChange={e => setData({ ...data, settings: { ...data.settings, initial_email_subject: e.target.value } })} /></label>
      <label>Message<textarea required maxLength={10000} rows={12} disabled={busy} value={data.settings.initial_email_body} onChange={e => setData({ ...data, settings: { ...data.settings, initial_email_body: e.target.value } })} /></label>
      <label>Nom du signataire<input required maxLength={500} disabled={busy} value={data.settings.sender_name} onChange={e => setData({ ...data, settings: { ...data.settings, sender_name: e.target.value } })} /></label>
      <label>Signature<input required maxLength={500} disabled={busy} value={data.settings.signature} onChange={e => setData({ ...data, settings: { ...data.settings, signature: e.target.value } })} /></label>
      <label>Téléphone commercial<input type="tel" maxLength={50} disabled={busy} value={data.settings.phone ?? ""} onChange={e => setData({ ...data, settings: { ...data.settings, phone: e.target.value } })} /></label>
      <p className={s.muted}>Laissez vide pour ne pas afficher de téléphone dans les nouveaux brouillons.</p>
      <button disabled={busy}>Enregistrer les paramètres</button>
    </form>}
  </section>;
}
