"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { emailRequest } from "@/lib/prospection/emailClient";
import { notifyProspectsChanged } from "@/lib/prospection/list";
import s from "@/app/admin/prospection/prospection.module.css";

type Item = { id: string; name: string; to: string; subject?: string; body?: string; state: string; reason?: string; retryable?: boolean };
type Batch = { id: string; confirmed: boolean; identity: { from: string; replyTo: string }; items: Item[] };
type Result = { batch: Batch | null; waitMs?: number };
const labels: Record<string, string> = { ready: "Prêt", processing: "En cours", sent: "Envoyé", failed: "Échec", unknown: "À vérifier", excluded: "Exclu" };
export function ProspectBulkEmail({ ids, emailCount, disabled }: { ids: string[]; emailCount: number; disabled: boolean }) {
  const [batch, setBatch] = useState<Batch | null>(null); const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false); const [active, setActive] = useState(false); const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(""); const [retryId, setRetryId] = useState<string | null>(null);
  const lock = useRef(false); const running = useRef(false); const mounted = useRef(true); const prepareId = useRef<string | null>(null);
  useEffect(() => { mounted.current = true; void emailRequest<Result>({ action: "batch_current" }).then(r => { if (mounted.current) setBatch(r.batch); }).catch(() => {}); return () => { mounted.current = false; running.current = false; }; }, []);
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
  return <div className={s.module}>
    <div className={s.actions}>
      <button disabled={disabled || busy || !emailCount || ids.length > 50} onClick={() => void run(async () => {
        prepareId.current ||= crypto.randomUUID();
        const r = await emailRequest<Result>({ action: "batch_prepare", batchId: prepareId.current, ids });
        prepareId.current = null; setBatch(r.batch); setOpen(true); setConfirm(false);
      })}>Préparer l’envoi groupé ({emailCount})</button>
      {batch && <button disabled={busy} onClick={() => void run(load)}>Reprendre / consulter le dernier lot</button>}
    </div>
    {error && <p role="alert" className={s.error}>{error}</p>}
    {open && batch && <section className={s.panel} aria-label="Envoi groupé">
      <h2>Envoi groupé</h2>
      <p>{batch.items.length} sélectionnés · {ready} prêts à envoyer · {batch.items.filter(i => i.state === "excluded").length} exclus</p>
      <p>Chaque entreprise reçoit son propre email, avec un seul destinataire. Les brouillons existants sont conservés.</p>
      <p>From : {batch.identity.from}<br />Reply-To : {batch.identity.replyTo}</p>
      <p role="status">{sent + failures} / {accepted.length} traités — {sent} envoyés · {failures} échecs ou résultats à vérifier</p>
      <p className={s.muted}>Un email à la fois, avec 30 secondes d’attente entre les envois. Gardez cette page ouverte. Après fermeture ou rafraîchissement, reprenez explicitement le lot ; les emails envoyés ne repartiront pas.</p>
      <ul className={s.prospectList}>{batch.items.map(i => <li className={s.bulkItem} key={i.id}>
        <strong>{i.name}</strong><p className={s.emailAddress}>{i.to || "Sans email primaire"}</p>
        {i.subject && <p>Objet : {i.subject}</p>}<p>{labels[i.state] || i.state}{i.reason && ` — ${i.reason}`}</p>
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
