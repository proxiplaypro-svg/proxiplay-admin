"use client";

import Link from "next/link";
import { STATUSES, type Prospect } from "@/lib/prospection/model";
import { commercialCategory, commercialEmailAction, daysSinceLastContact, emailErrorExplanation, prospectEmailSummary } from "@/lib/prospection/list";
import { relevance } from "@/lib/prospection/relevance";
import s from "@/app/admin/prospection/prospection.module.css";

export function ProspectList({ prospects, selection, busy, onSelect, onRetry, selectable = true, showEmailActions = true, campaignMode = false }: { prospects: Prospect[]; selection: Set<string>; busy: boolean; onSelect: (id: string, selected: boolean) => void; onRetry: (id: string) => void; selectable?: boolean; showEmailActions?: boolean; campaignMode?: boolean }) {
  return <ul className={s.prospectList} aria-label="Liste des prospects">{prospects.map(p => {
    const summary = prospectEmailSummary(p); const href = `/admin/prospection/${encodeURIComponent(p.id)}`; const category = commercialCategory(p); const days = daysSinceLastContact(p.last_contact_at); const emailAction = commercialEmailAction(p, Boolean(summary.email));
    const sentAt = p.proposal?.status === "sent" ? p.proposal.sent_at : undefined;
    const fit = relevance(p);
    const errorDetail = summary.state === "failed" ? `${p.email_enrichment_error || "UNKNOWN"} — ${emailErrorExplanation(p.email_enrichment_error)}` : "";
    const fitLabel = `Pertinence : ${fit.score}/100 — ${fit.reasons.join(" · ") || "Données insuffisantes"}`;
    const channels = Object.entries(fit.channels).filter(([, available]) => available).map(([channel]) => ({ email: "email", phone: "téléphone", website: "site internet", form: "formulaire" }[channel]));
    return <li className={`${s.prospectRow} ${!selectable ? s.prospectRowStatic : ""}`} key={p.id} data-prospect-id={p.id}>
      {selectable && <input className={s.rowSelect} type="checkbox" aria-label={`Sélectionner ${p.name}`} disabled={busy || (!selection.has(p.id) && selection.size >= 50)} checked={selection.has(p.id)} onChange={e => onSelect(p.id, e.target.checked)} />}
      <div className={s.prospectInfo}>
        <Link className={s.companyName} href={href}>{p.name}</Link>
        <div className={s.emailInfo}>
          {summary.email && <p className={s.emailAddress}>✉ {summary.email}</p>}
          <p className={summary.state === "found" ? s.emailFound : summary.state === "failed" ? s.emailFailed : s.muted}>{summary.label}{summary.additional > 0 && <span className={s.muted}> · +{summary.additional} autre{summary.additional > 1 ? "s" : ""} email{summary.additional > 1 ? "s" : ""}</span>}</p>
          {errorDetail && <p className={s.muted}><code>{errorDetail.split(" — ")[0]}</code> — {errorDetail.split(" — ").slice(1).join(" — ")}</p>}
        </div>
        <div className={s.rowMeta}><span className={s.badge}>{campaignMode ? STATUSES[category] : p.status === "contacted" ? "Contacté" : STATUSES[p.status]}</span><span>{[p.category, p.city].filter(Boolean).join(" · ")}</span>{p.do_not_contact && <span>Ne pas contacter</span>}</div>
        {sentAt && <p className={s.emailFound}>Email envoyé · <time dateTime={sentAt}>{new Date(sentAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</time></p>}
        {campaignMode && category === "contacted" && days !== null && <p className={s.muted}>{days === 0 ? "Contacté aujourd’hui" : `Contacté il y a ${days} j`}</p>}
        {!campaignMode && p.next_follow_up_at && <p className={s.muted}>Relance : {new Date(p.next_follow_up_at).toLocaleDateString("fr-FR")}</p>}
      </div>
        <p className={s.muted}>{fitLabel}</p>
        {!summary.email && <p className={s.muted}>Canaux disponibles : {channels.length ? channels.join(", ") : "aucun renseigné"}</p>}
        <div className={s.rowActions}>
        {showEmailActions && !campaignMode && summary.email && <Link className={`${s.link} ${s.primary}`} href={`${href}#proposition`}>Préparer le mail</Link>}
        {campaignMode && emailAction === "initial" && <Link className={`${s.link} ${s.primary}`} href={`${href}#proposition`}>Préparer le mail</Link>}
        {campaignMode && emailAction === "follow_up" && <Link className={`${s.link} ${s.primary}`} href={`${href}#proposition`}>Préparer la relance</Link>}
        {showEmailActions && summary.state === "failed" && <button disabled={busy} onClick={() => onRetry(p.id)}>Réessayer</button>}
        <Link className={s.link} href={href}>Voir<span className={s.srOnly}> {p.name}</span></Link>
      </div>
    </li>;
  })}</ul>;
}
