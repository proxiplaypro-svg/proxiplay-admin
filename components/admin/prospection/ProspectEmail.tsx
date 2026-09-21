"use client";
import { useEffect, useRef, useState } from "react";
import { emailRequest } from "@/lib/prospection/emailClient";
import type { EmailLog, Proposal, Prospect } from "@/lib/prospection/model";
import { notifyProspectsChanged } from "@/lib/prospection/list";
import s from "@/app/admin/prospection/prospection.module.css";

export function ProspectEmail({ prospect, logs, reload, disabled }: { prospect: Prospect; logs: EmailLog[]; reload: () => Promise<void>; disabled: boolean }) {
  const [proposal, setProposal] = useState<Proposal | null>(prospect.proposal || null);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<Proposal | null>(null);
  const proposalHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (window.location.hash === "#proposition") { proposalHeading.current?.scrollIntoView(); proposalHeading.current?.focus({ preventScroll: true }); } }, [prospect.id]);
  useEffect(() => { setProposal(prospect.proposal || null); }, [prospect.proposal]);
  async function run(work: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (error) { setError(error instanceof Error ? error.message : "L’opération a échoué."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function action(action: string, extra: Record<string, unknown> = {}) { setConfirmation(null); await emailRequest({ action, id: prospect.id, ...extra }); await reload(); }
  async function save() {
    if (!proposal) throw new Error("Générez une proposition.");
    const result = await emailRequest<{ proposal: Proposal }>({ ...proposal, action: "save", id: prospect.id, draftId: proposal.id });
    await reload(); setProposal(result.proposal); return result.proposal;
  }
  const blocked = disabled || busy;
  const editable = proposal?.status === "draft";
  const status = prospect.email_enrichment_status;
  return <section className={s.panel}>
    <h2>Email professionnel public</h2>
    {disabled && <p className={s.muted}>Enregistrez les modifications de la fiche avant d’utiliser cette section.</p>}
    {error && <p role="alert" className={s.error}>{error}</p>}{notice && <p role="status" className={s.notice}>{notice}</p>}
    <div className={s.actions}>
      <button disabled={blocked} onClick={() => void run(async () => { await action("enrich"); })}>Rechercher l’email</button>
      <button disabled={blocked} onClick={() => { if (window.confirm("Supprimer les coordonnées enrichies et le brouillon ? Les emails manuels et le journal des envois seront conservés.")) void run(() => action("erase")); }}>Supprimer les coordonnées enrichies</button>
    </div>
    {status === "running" && <p role="status">Recherche en cours. Actualisez la fiche si nécessaire.</p>}
    {status === "not_found" && <p>Aucun email professionnel public trouvé</p>}
    {status === "failed" && <p role="alert">{prospect.email_enrichment_error === "SITE_INACCESSIBLE" ? "Site inaccessible" : "Recherche email échouée"}</p>}
    {Boolean(prospect.emails?.length) && <><p>Email public trouvé. La présence publique ne garantit pas la délivrabilité.</p><ul>{prospect.emails?.map(item => <li key={item.email}>
      <label><input type="radio" name="primary-email" checked={item.is_primary} disabled={blocked} onChange={() => void run(() => action("primary", { email: item.email }))} /> {item.email} — {item.type}</label>
      <a href={item.source_url} target="_blank" rel="noreferrer">Source exacte</a> · {new Date(item.discovered_at).toLocaleString("fr-FR")}
    </li>)}</ul></>}
    <label className={s.check}><input type="checkbox" checked={Boolean(prospect.do_not_contact)} disabled={blocked} onChange={e => void run(() => action("do_not_contact", { value: e.target.checked }))} /> Ne pas contacter</label>
    <h2 id="proposition" ref={proposalHeading} tabIndex={-1} className={s.proposalHeading}>Proposition commerciale</h2>
    <p className={s.muted}>Brouillon factuel sans IA externe, utilisant les paramètres commerciaux enregistrés. Vérifiez le contenu avant envoi.</p>
    <button disabled={blocked || Boolean(prospect.email_sending_id)} onClick={() => {
      if (proposal && !window.confirm(proposal.status === "draft" ? "Remplacer le brouillon et ses modifications ?" : "Créer une nouvelle proposition pour un nouvel envoi volontaire ? Vérifiez d’abord le journal et votre boîte d’envoi.")) return;
      void run(async () => { await action("generate", { replace: Boolean(proposal) }); });
    }}>{proposal ? "Régénérer" : "Générer la proposition"}</button>
    {proposal && <form className={s.module} onSubmit={e => { e.preventDefault(); void run(async () => { setConfirmation(await save()); }); }}>
      <p role="status">{proposal.status === "sent" ? "Email envoyé" : proposal.status === "sending" ? "Envoi en cours ou résultat à vérifier. Aucun renvoi automatique." : proposal.status === "failed" ? "Envoi échoué ou résultat incertain. Vérifiez avant de régénérer." : "Brouillon — aucun envoi effectué"}</p>
      {Boolean(prospect.emails?.length) && editable && <label>Choisir un email public<select disabled={blocked || Boolean(confirmation)} value={prospect.emails?.some(item => item.email === proposal.to) ? proposal.to : ""} onChange={e => { if (e.target.value) setProposal({ ...proposal, to: e.target.value }); }}><option value="">Adresse saisie ci-dessous</option>{prospect.emails?.map(item => <option key={item.email} value={item.email}>{item.email}</option>)}</select></label>}
      <label>À<input type="email" required maxLength={254} value={proposal.to} disabled={blocked || !editable || Boolean(confirmation)} onChange={e => setProposal({ ...proposal, to: e.target.value })} /></label>
      <label>Objet<input required maxLength={200} value={proposal.subject} disabled={blocked || !editable || Boolean(confirmation)} onChange={e => setProposal({ ...proposal, subject: e.target.value })} /></label>
      <label>Message<textarea required maxLength={10000} rows={19} value={proposal.body} disabled={blocked || !editable || Boolean(confirmation)} onChange={e => setProposal({ ...proposal, body: e.target.value })} /></label>
      <div className={s.actions}>
        <button type="button" disabled={blocked} onClick={() => void run(async () => { await navigator.clipboard.writeText(`À : ${proposal.to}\nObjet : ${proposal.subject}\n\n${proposal.body}`); setNotice("Copié."); })}>Copier</button>
        <button type="button" disabled={blocked || !editable || Boolean(confirmation)} onClick={() => void run(async () => { await save(); setNotice("Brouillon enregistré."); })}>Enregistrer le brouillon</button>
        <button disabled={blocked || !editable || prospect.do_not_contact || Boolean(confirmation)}>Envoyer</button>
      </div>
      {confirmation && <div role="alertdialog" aria-label="Confirmer l’envoi" aria-describedby="email-confirmation-text">
        <p id="email-confirmation-text">Envoyer cette proposition à {confirmation.to} ?</p>
        <button type="button" disabled={blocked || prospect.do_not_contact} onClick={() => void run(async () => {
          setConfirmation(null);
          const result = await emailRequest<{ status: string }>({ action: "send", id: prospect.id, draftId: confirmation.id, revision: confirmation.revision, confirmed: true });
          if (result.status === "sent") notifyProspectsChanged();
          await reload(); setNotice(result.status === "sent" ? "Email envoyé" : "Cet envoi a déjà été traité. Consultez son statut dans le journal.");
        })}>Confirmer</button>
        <button type="button" disabled={busy} onClick={() => setConfirmation(null)}>Annuler</button>
      </div>}
    </form>}
    <h3>Journal des emails</h3>
    {!logs.length && <p>Aucun envoi enregistré.</p>}
    <ul>{logs.map(log => <li key={log.id}><details><summary>{new Date(log.sent_at || log.created_at).toLocaleString("fr-FR")} · {log.to} · {log.subject} · {log.status === "sent" ? "Envoyé" : log.status === "failed" ? "Échec / à vérifier" : "En cours / à vérifier"}</summary><pre style={{ whiteSpace: "pre-wrap" }}>{log.body}</pre>{log.provider_message_id && <p>Identifiant provider : {log.provider_message_id}</p>}{log.error_code && <p>{log.error_code}</p>}</details></li>)}</ul>
    {busy && <p role="status">Opération en cours…</p>}
  </section>;
}
