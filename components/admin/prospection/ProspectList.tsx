"use client";
import Link from "next/link";
import { STATUSES, type Prospect } from "@/lib/prospection/model";
import { prospectEmailSummary } from "@/lib/prospection/list";
import s from "@/app/admin/prospection/prospection.module.css";

export function ProspectList({ prospects, selection, busy, onSelect, onRetry }: { prospects: Prospect[]; selection: Set<string>; busy: boolean; onSelect: (id: string, selected: boolean) => void; onRetry: (id: string) => void }) {
  return <ul className={s.prospectList} aria-label="Liste des prospects">{prospects.map(p => {
    const summary = prospectEmailSummary(p); const href = `/admin/prospection/${encodeURIComponent(p.id)}`;
    const sentAt = p.proposal?.status === "sent" ? p.proposal.sent_at : undefined;
    return <li className={s.prospectRow} key={p.id} data-prospect-id={p.id}>
      <input className={s.rowSelect} type="checkbox" aria-label={`Sélectionner ${p.name}`} disabled={busy || (!selection.has(p.id) && selection.size >= 50)} checked={selection.has(p.id)} onChange={e => onSelect(p.id, e.target.checked)} />
      <div className={s.prospectInfo}>
        <Link className={s.companyName} href={href}>{p.name}</Link>
        <div className={s.emailInfo}>
          {summary.email && <p className={s.emailAddress}>✉ {summary.email}</p>}
          <p className={summary.state === "found" ? s.emailFound : summary.state === "failed" ? s.emailFailed : s.muted}>{summary.label}{summary.additional > 0 && <span className={s.muted}> · +{summary.additional} autre{summary.additional > 1 ? "s" : ""} email{summary.additional > 1 ? "s" : ""}</span>}</p>
        </div>
        <div className={s.rowMeta}><span className={s.badge}>{p.status === "contacted" ? "Contacté" : STATUSES[p.status]}</span><span>{[p.category, p.city].filter(Boolean).join(" · ")}</span>{p.do_not_contact && <span>Ne pas contacter</span>}</div>
        {sentAt && <p className={s.emailFound}>Email envoyé · <time dateTime={sentAt}>{new Date(sentAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</time></p>}
        {p.next_follow_up_at && <p className={s.muted}>Relance : {new Date(p.next_follow_up_at).toLocaleDateString("fr-FR")}</p>}
      </div>
      <div className={s.rowActions}>
        {summary.email && <Link className={`${s.link} ${s.primary}`} href={`${href}#proposition`}>Préparer le mail</Link>}
        {summary.state === "failed" && <button disabled={busy} onClick={() => onRetry(p.id)}>Réessayer</button>}
        <Link className={s.link} href={href}>Voir<span className={s.srOnly}> {p.name}</span></Link>
      </div>
    </li>;
  })}</ul>;
}
