"use client";
import { useRef, useState } from "react";
import { emailRequest } from "@/lib/prospection/emailClient";
import s from "@/app/admin/prospection/prospection.module.css";
type Settings = { connections_per_day: number | null; download_url: string; website_url: string; sender_name: string; signature: string };
type TestEmail = { id: string; to: string; subject: string; body: string; status: string };
type Data = { settings: Settings; revision: number; test?: TestEmail | null };
export function ProspectionSettings() {
  const [data, setData] = useState<Data | null>(null); const [test, setTest] = useState<TestEmail | null>(null);
  const [busy, setBusy] = useState(false); const lock = useRef(false); const [notice, setNotice] = useState(""); const [error, setError] = useState(""); const [confirm, setConfirm] = useState(false);
  async function run(work: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Opération échouée."); } finally { lock.current = false; setBusy(false); }
  }
  async function load() { const result = await emailRequest<Data>({ action: "settings_get" }); setData(result); setTest(result.test || null); setConfirm(false); }
  return <section className={s.panel}><h2>Paramètres commerciaux</h2>
    <button disabled={busy} onClick={() => void run(load)}>{data ? "Recharger les paramètres" : "Configurer la prospection"}</button>
    {error && <p role="alert" className={s.error}>{error}</p>}{notice && <p role="status">{notice}</p>}
    {data && <><form className={s.module} onSubmit={e => { e.preventDefault(); void run(async () => { const saved = await emailRequest<Data>({ action: "settings_save", settings: data.settings, revision: data.revision }); setData(saved); setNotice("Paramètres enregistrés. Ils seront utilisés à la prochaine génération ; les brouillons existants sont conservés."); }); }}>
      <label>Connexions par jour<input type="number" min={0} max={1000000000} step={1} disabled={busy} value={data.settings.connections_per_day ?? ""} onChange={e => setData({ ...data, settings: { ...data.settings, connections_per_day: e.target.value === "" ? null : Number(e.target.value) } })} /></label>
      <p className={s.muted}>Laissez vide pour ne mentionner aucun chiffre de fréquentation.</p>
      {([['download_url', 'Lien de téléchargement'], ['website_url', 'Site Proxiplay'], ['sender_name', 'Nom du signataire'], ['signature', 'Signature']] as const).map(([key, label]) => <label key={key}>{label}<input required type={key.endsWith("url") ? "url" : "text"} maxLength={key.endsWith("url") ? 2000 : 500} disabled={busy} value={data.settings[key]} onChange={e => setData({ ...data, settings: { ...data.settings, [key]: e.target.value } })} /></label>)}
      <button disabled={busy}>Enregistrer les paramètres</button>
    </form>
    <h3>Email de test interne</h3><p>Un seul test par compte administrateur, envoyé exclusivement à l’adresse de ce compte. Enregistrez les paramètres avant de préparer le test.</p>
    <button disabled={busy || Boolean(test)} onClick={() => void run(async () => { const result = await emailRequest<{ test: TestEmail }>({ action: "test_prepare" }); setTest(result.test); })}>Préparer l’email de test</button>
    {test && <><p>À : {test.to}</p><p>Objet : {test.subject}</p><pre style={{ whiteSpace: "pre-wrap" }}>{test.body}</pre><p role="status">{test.status === "draft" ? "Test préparé, aucun envoi effectué" : test.status === "sent" ? "Email de test accepté par SMTP. Vérifiez sa réception et le Reply-To dans votre boîte." : "Test déjà tenté : vérifiez le journal serveur et votre boîte. Aucun renvoi automatique."}</p>
      <button disabled={busy || test.status !== "draft" || confirm} onClick={() => setConfirm(true)}>Envoyer le test à mon adresse</button>
      {confirm && <div role="alertdialog" aria-label="Confirmation du test"><p>Envoyer un email de test à {test.to} ?</p><button disabled={busy} onClick={() => void run(async () => { setConfirm(false); await emailRequest({ action: "test_send", testId: test.id, confirmed: true }); await load(); })}>Confirmer</button><button disabled={busy} onClick={() => setConfirm(false)}>Annuler</button></div>}
    </>}
    </>}
  </section>;
}
