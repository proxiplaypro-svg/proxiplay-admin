"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { emailRequest } from "@/lib/prospection/emailClient";
import { notifyProspectsChanged } from "@/lib/prospection/list";
import s from "@/app/admin/prospection/prospection.module.css";

type Item = { id: string; name: string; to: string; subject?: string; body?: string; state: string; variant?: "A" | "B"; prospect_status?: string | null; reason?: string; retryable?: boolean };
type Batch = { id: string; confirmed: boolean; identity: { from: string; replyTo: string }; campaign_name?: string; kind?: "initial" | "follow_up"; items: Item[] };
type Result = { batch: Batch | null; waitMs?: number };
const labels: Record<string, string> = { ready: "Prêt", processing: "En cours", sent: "Envoyé", failed: "Échec", unknown: "À vérifier", excluded: "Exclu" };
type Campaign = { kind: "initial" | "follow_up"; name?: string };
export function ProspectBulkEmail({ ids, emailCount, disabled, message, campaign }: { ids: string[]; emailCount: number; disabled: boolean; message?: { subject: string; body: string }; campaign?: Campaign }) {
  const [batch, setBatch] = useState<Batch | null>(null); const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false); const [active, setActive] = useState(false); const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(""); const [retryId, setRetryId] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState(campaign?.name || "");
  const [variantA, setVariantA] = useState(message || { subject: "", body: "" }); const [variantB, setVariantB] = useState(message || { subject: "", body: "" });
  const lock = useRef(false); const running = useRef(false); const mounted = useRef(true); const prepareId = useRef<string | null>(null);
  useEffect(() => { mounted.current = true; void emailRequest<Result>({ action: "batch_current" }).then(r => { if (mounted.current) setBatch(r.batch); }).catch(() => {}); if (campaign) void emailRequest<{ subject: string; body: string }>({ action: "batch_template", kind: campaign.kind }).then(template => { if (!mounted.current) return; setVariantA(current => current.subject || current.body ? current : template); setVariantB(current => current.subject || current.body ? current : template); }).catch(() => {}); return () => { mounted.current = false; running.current = false; }; }, [campaign?.kind]);
  async function run(work: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { await work(); } catch (e) { running.current = false; setActive(false); setError(e instanceof Error ? e.message : "Opération échouée. Rechargez le lot pour connaître son état."); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function load() { const r = await emailRequest<Result>({ action: "batch_current" }); setBatch(r.batch); setOpen(true); }
  async function process(id: string) {
    running.current = true; setActive(true);
    try {
      while (running.current && mounted.current) {
        const r = await emailRequest<Result>({ action: "batch_step", batchId: id });
        if (!mounted.current) break;
        setBatch(r.batch); notifyProspectsChanged();
        if (!r.batch?.items.some(i => ["ready", "processing"].includes(i.state))) break;
        await new Promise(resolve => setTimeout(resolve, Math.max(1000, Math.min(r.waitMs || 30000, 30000))));
      }
    } finally { running.current = false; if (mounted.current) setActive(false); }
  }
  const ready = batch?.items.filter(i => i.state === "ready").length || 0;
  const pending = batch?.items.filter(i => ["ready", "processing"].includes(i.state)).length || 0;
  const accepted = batch?.items.filter(i => i.state !== "excluded") || [];
  const sent = accepted.filter(i => i.state === "sent").length;
  const failures = accepted.filter(i => ["failed", "unknown"].includes(i.state)).length;
  const manualReplies = accepted.filter(i => i.prospect_status === "replied").length;
  const meetings = accepted.filter(i => i.prospect_status === "meeting").length;
  const conversions = accepted.filter(i => i.prospect_status === "client").length;
  return <div className={s.module}>
    <div className={s.actions}>
      <button disabled={disabled || busy || !emailCount || ids.length > 50 || Boolean(campaign && (!variantA.subject.trim() || !variantA.body.trim() || !variantB.subject.trim() || !variantB.body.trim()))} onClick={() => void run(async () => {
        prepareId.current ||= crypto.randomUUID();
        const r = await emailRequest<Result>({ action: "batch_prepare", batchId: prepareId.current, ids, ...message, ...(campaign ? { kind: campaign.kind, campaignName, variants: { a: variantA, b: variantB } } : {}) });
        prepareId.current = null; setBatch(r.batch); setOpen(true); setConfirm(false);
      })}>Préparer les {emailCount} emails</button>
      {batch && <button disabled={busy} onClick={() => void run(load)}>Voir le lot d’envoi</button>}
    </div>
    {campaign && <section className={s.panel}><h3>Variantes de campagne</h3><p className={s.muted}>Affectation stable A/B avant confirmation. La prévisualisation ci-dessous reste obligatoire ; aucun envoi n’est automatique.</p><label>Nom de campagne (facultatif)<input value={campaignName} maxLength={120} onChange={e => setCampaignName(e.target.value)} /></label>{([ ["A", variantA, setVariantA], ["B", variantB, setVariantB] ] as const).map(([label, variant, setVariant]) => <fieldset key={label}><legend>Variante {label}</legend><label>Objet<input value={variant.subject} maxLength={200} onChange={e => setVariant({ ...variant, subject: e.target.value })} /></label><label>Message<textarea value={variant.body} maxLength={10000} onChange={e => setVariant({ ...variant, body: e.target.value })} /></label></fieldset>)}</section>}
    {error && <p role="alert" className={s.error}>{error}</p>}
    {open && batch && <section className={s.panel} aria-label="Envoi groupé">
      <h2>{batch.campaign_name || "Envoi groupé"}</h2>
      <p>{batch.items.length} sélectionnés · {ready} prêts à envoyer · {batch.items.filter(i => i.state === "excluded").length} exclus</p>
      <p>Chaque entreprise reçoit son propre email, avec un seul destinataire. Les brouillons existants sont conservés.</p>
      <p>From : {batch.identity.from}<br />Reply-To : {batch.identity.replyTo}</p>
      <p role="status">{sent + failures} / {accepted.length} traités — {sent} acceptés SMTP · {failures} erreurs ou résultats à vérifier</p>
      <p className={s.muted}>Accepté SMTP ne confirme ni réception en boîte principale ni lecture. Les retours SMTP asynchrones ne sont pas synchronisés.</p>
      <p className={s.muted}>Résultats déclarés manuellement, dédoublonnés par prospect dans ce lot : {manualReplies} réponse(s) · {meetings} rendez-vous · {conversions} conversion(s).</p>
      <p className={s.muted}>Un email à la fois, avec 30 secondes d’attente entre les envois. Gardez cette page ouverte. Après fermeture ou rafraîchissement, reprenez explicitement le lot ; les emails envoyés ne repartiront pas.</p>
      <ul className={s.prospectList}>{batch.items.map(i => <li className={s.bulkItem} key={i.id}>
        <strong>{i.name}</strong><p className={s.emailAddress}>{i.to || "Sans adresse email envoyable"}</p>
        {i.variant && <p>Variante {i.variant}</p>}{i.subject && <p>Objet : {i.subject}</p>}<p>{labels[i.state] || i.state}{i.reason && ` — ${i.reason}`}</p>
        {i.body && <details><summary>Inspecter le message individuel</summary><pre className={s.bulkBody}>{i.body}</pre></details>}
        <Link className={s.link} href={`/admin/prospection/${encodeURIComponent(i.id)}#proposition`} target="_blank">Voir la fiche</Link>
        {i.retryable && <button disabled={busy || active || pending > 0} onClick={() => setRetryId(i.id)}>Réessayer uniquement cet email</button>}
      </li>)}</ul>
      {pending > 0 && !active && <button disabled={busy} onClick={() => setConfirm(true)}>{batch.confirmed ? "Reprendre les emails restants" : "Confirmer le lot"}</button>}
      {active && <button onClick={() => { running.current = false; }}>Suspendre après l’email en cours</button>}
      <button disabled={busy || active} onClick={() => { setOpen(false); setConfirm(false); }}>Fermer</button>
      {(confirm || retryId) && <div role="alertdialog" aria-label="Confirmation de l’envoi groupé" className={s.panel}>
        <p>Confirmer l’envoi de {retryId ? 1 : ready} emails individuels ?</p>
        <p>From : {batch.identity.from}<br />Reply-To : {batch.identity.replyTo}</p>
        <button disabled={busy} onClick={() => { setConfirm(false); setRetryId(null); }}>Annuler</button>
        <button disabled={busy} onClick={() => void run(async () => {
          const id = retryId; setConfirm(false); setRetryId(null);
          await emailRequest({ action: id ? "batch_retry" : "batch_confirm", batchId: batch.id, confirmed: true, ...(id ? { id } : {}) });
          await process(batch.id);
        })}>Envoyer les {retryId ? 1 : ready} emails</button>
      </div>}
    </section>}
  </div>;
}
