"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { prospectRequest } from "@/lib/prospection/client";
import { importableIndices, normalize, SECTORS, type Prospect, type SearchResult } from "@/lib/prospection/model";
import { prospectEmailSummary, PROSPECTS_CHANGED } from "@/lib/prospection/list";
import { isCampaignEmailEligible } from "@/lib/prospection/emailRecipient";
import { emailRequest, type EnrichmentBatch } from "@/lib/prospection/emailClient";
import { ProspectBulkEmail } from "@/components/admin/prospection/ProspectBulkEmail";
import s from "./prospection.module.css";

// Server limits, unchanged: 50 recipients per send batch, 3 email searches per call.
const MAX_RECIPIENTS = 50;
const ENRICH_CHUNK = 3;
// Never searched, or the website failed. "Aucun email public" was already searched and is not retried.
const missingEmail = (p: Prospect) => ["not_started", "failed"].includes(prospectEmailSummary(p).state);

function emailCell(p: Prospect) {
  const summary = prospectEmailSummary(p);
  if (p.do_not_contact) return <span className={s.muted}>Ne pas contacter{p.unsubscribed_at ? " (désinscrit)" : ""}</span>;
  if (p.proposal?.status === "sent" && p.proposal.sent_at) return <span className={s.emailFound}>{summary.email} · envoyé le {new Date(p.proposal.sent_at).toLocaleDateString("fr-FR")}</span>;
  if (summary.email) return <span className={s.emailFound}>✓ {summary.email}</span>;
  return <span className={summary.state === "failed" ? s.emailFailed : s.muted}>{summary.label}</span>;
}

export default function ProspectionPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]); const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [city, setCity] = useState("Dunkerque"); const [sector, setSector] = useState(SECTORS[0]);
  const [results, setResults] = useState<SearchResult[] | null>(null); const [excludedCount, setExcludedCount] = useState(0);
  const [enriching, setEnriching] = useState(false); const [progress, setProgress] = useState(""); const stop = useRef(false);
  const [query, setQuery] = useState(""); const [selection, setSelection] = useState<Set<string>>(new Set());
  const [composer, setComposer] = useState<"closed" | "open" | "hidden">("closed");
  const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const reloadVersion = useRef(0);
  const reload = useCallback(async () => { const version = ++reloadVersion.current; const data = await prospectRequest<{ prospects: Prospect[]; searchAvailable: boolean }>(); if (version !== reloadVersion.current) return; setProspects(data.prospects); setAvailable(data.searchAvailable); }, []);
  useEffect(() => { reload().catch(error => setError(error.message)).finally(() => setLoading(false)); }, [reload]);
  useEffect(() => { const refresh = () => { void reload().catch(error => setError(error.message)); }; const changed = (event: StorageEvent) => { if (event.key === PROSPECTS_CHANGED) refresh(); }; window.addEventListener("focus", refresh); window.addEventListener(PROSPECTS_CHANGED, refresh); window.addEventListener("storage", changed); return () => { window.removeEventListener("focus", refresh); window.removeEventListener(PROSPECTS_CHANGED, refresh); window.removeEventListener("storage", changed); }; }, [reload]);
  async function run(work: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await work(); } catch (error) { setError(error instanceof Error ? error.message : "L’opération a échoué."); } finally { setBusy(false); } }

  const eligible = new Set(prospects.filter(isCampaignEmailEligible).map(p => p.id));
  const missing = prospects.filter(missingEmail);
  const visible = query ? prospects.filter(p => normalize([p.name, p.city, prospectEmailSummary(p).email].join(" ")).includes(normalize(query))) : prospects;
  const selected = prospects.filter(p => selection.has(p.id) && eligible.has(p.id)); // A sent or unsubscribed prospect drops out on reload.
  const fresh = results ? importableIndices(results).map(index => results[index]) : [];
  const toggle = (id: string, checked: boolean) => setSelection(previous => { const next = new Set(previous); if (checked) next.add(id); else next.delete(id); return next; });

  async function searchCompanies() {
    const data = await prospectRequest<{ results: SearchResult[]; excludedCount: number }>("POST", { action: "search", location: city, radius: 15, categories: [sector], limit: 50, onlyNew: true });
    setResults(data.results); setExcludedCount(data.excludedCount);
  }
  async function importCompanies() {
    const imported = await prospectRequest<{ created: string[]; skipped: { name: string }[] }>("POST", { action: "import", selection: fresh });
    setResults(null); await reload();
    setNotice(`${imported.created.length} entreprise(s) ajoutée(s)${imported.skipped.length ? ` · ${imported.skipped.length} doublon(s) bloqué(s)` : ""}.`);
  }
  async function findMissingEmails() {
    const ids = missing.map(p => p.id); const totals = { found: 0, not_found: 0, failed: 0 }; let done = 0;
    stop.current = false; setEnriching(true); setError(""); setNotice("");
    const report = (suffix = "") => setProgress(`${done} / ${ids.length} entreprises analysées · ${totals.found} avec email · ${totals.not_found} sans email · ${totals.failed} échec(s)${suffix}`);
    report();
    try {
      for (let offset = 0; offset < ids.length && !stop.current; offset += ENRICH_CHUNK) {
        const chunk = ids.slice(offset, offset + ENRICH_CHUNK);
        try { const result = await emailRequest<EnrichmentBatch>({ action: "enrich_batch", ids: chunk }); totals.found += result.found; totals.not_found += result.not_found; totals.failed += result.failed; }
        catch (error) { if (error instanceof Error && error.message.startsWith("Service email indisponible")) throw error; totals.failed += chunk.length; }
        done += chunk.length; report();
        if (done % 30 === 0) void reload().catch(() => {}); // Results are saved per prospect; refresh the list as we go.
      }
      report(stop.current ? " — arrêté. Les emails déjà trouvés sont conservés." : " — terminé.");
    } catch (error) { setError(error instanceof Error ? error.message : "La recherche d’emails a échoué."); }
    finally { setEnriching(false); await reload().catch(() => {}); }
  }
  async function openComposer() {
    if (!subject && !body) { const template = await emailRequest<{ subject: string; body: string }>({ action: "batch_template" }); setSubject(template.subject); setBody(template.body); }
    setComposer("open");
  }

  return <div className={s.module}>
    <header className={s.toolbar}><div className={s.pageHeader}><h1>Prospection</h1><p className={s.muted}>Trouvez des emails professionnels, puis envoyez votre message.</p></div><Link className={s.link} href="/admin/prospection/avance">Vue avancée</Link></header>
    {error && <p role="alert" className={s.error}>{error}</p>}{notice && <p role="status" className={s.notice}>{notice}</p>}

    <section className={s.panel} aria-label="Trouver">
      <h2>1. Trouver des emails</h2>
      <form className={s.filters} onSubmit={event => { event.preventDefault(); void run(searchCompanies); }}>
        <label>Ville<input required maxLength={500} value={city} onChange={event => setCity(event.target.value)} /></label>
        <label>Secteur<select value={sector} onChange={event => setSector(event.target.value)}>{SECTORS.map(value => <option key={value}>{value}</option>)}</select></label>
        <div className={s.actions} style={{ alignSelf: "end" }}><button className={s.primary} disabled={busy || enriching || !available}>Rechercher des entreprises</button></div>
      </form>
      {!loading && !available && <p className={s.muted}>La recherche Google n’est pas configurée.</p>}
      {results && <div className={s.module}>
        <p>{fresh.length} nouvelle(s) entreprise(s) trouvée(s){excludedCount > 0 && ` · ${excludedCount} déjà connue(s) écartée(s)`}.</p>
        {fresh.length > 0 && <ul className={s.muted}>{fresh.map(result => <li key={result.google_place_id || result.name}>{result.name} — {result.city}{result.website ? "" : " (pas de site web)"}</li>)}</ul>}
        <div className={s.actions}><button className={s.primary} disabled={busy || !fresh.length} onClick={() => void run(importCompanies)}>Ajouter les {fresh.length} entreprise(s)</button><button disabled={busy} onClick={() => setResults(null)}>Fermer</button></div>
      </div>}
      <div className={s.actions}>
        <button disabled={busy || enriching || !missing.length} onClick={() => void findMissingEmails()}>Trouver les emails manquants ({missing.length})</button>
        {enriching && <button onClick={() => { stop.current = true; }}>Stop</button>}
      </div>
      {progress && <p role="status">{progress}</p>}
    </section>

    <section className={s.panel} aria-label="Envoyer">
      <h2>2. Envoyer des emails</h2>
      <p><strong>{eligible.size}</strong> entreprise(s) avec email exploitable · <strong>{selected.length}</strong> cochée(s) (50 max.)</p>
      <div className={s.actions}>
        <button disabled={busy} onClick={() => setSelection(new Set(visible.filter(p => eligible.has(p.id)).slice(0, MAX_RECIPIENTS).map(p => p.id)))}>Cocher les entreprises avec email</button>
        <button disabled={busy || !selection.size} onClick={() => setSelection(new Set())}>Décocher</button>
        <button className={s.primary} disabled={busy || !selected.length || selected.length > MAX_RECIPIENTS} onClick={() => void run(openComposer)}>Envoyer un email</button>
      </div>
      {composer !== "closed" && <section className={s.panel} aria-label="Email" hidden={composer === "hidden"}>
        <h2>Email</h2>
        <label>Objet<input required maxLength={200} value={subject} onChange={event => setSubject(event.target.value.replace(/[\r\n]/g, " "))} /></label>
        <label>Message<textarea required maxLength={10000} rows={14} value={body} onChange={event => setBody(event.target.value)} /></label>
        <p className={s.muted}>Un lien de désinscription est ajouté automatiquement à la fin de chaque email. Chaque entreprise reçoit son propre email.</p>
        <details><summary>Destinataires ({selected.length})</summary><ul>{selected.map(p => <li key={p.id}>{p.name} — {prospectEmailSummary(p).email}</li>)}</ul></details>
        <ProspectBulkEmail ids={selected.map(p => p.id)} emailCount={selected.length} disabled={busy || !subject.trim() || !body.trim() || selected.length > MAX_RECIPIENTS} message={{ subject, body }} />
        <div><button onClick={() => setComposer("hidden")}>Masquer l’éditeur</button></div>
      </section>}
      <label>Filtrer la liste<input placeholder="Entreprise, ville, email…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className={s.table}><table><thead><tr><th><span className={s.srOnly}>Sélection</span></th><th>Entreprise</th><th>Ville</th><th>Email</th></tr></thead><tbody>
        {visible.map(p => <tr key={p.id} data-prospect-id={p.id}>
          <td><input type="checkbox" aria-label={`Sélectionner ${p.name}`} disabled={!eligible.has(p.id) || (!selection.has(p.id) && selected.length >= MAX_RECIPIENTS)} checked={selection.has(p.id) && eligible.has(p.id)} onChange={event => toggle(p.id, event.target.checked)} /></td>
          <td><Link className={s.companyName} href={`/admin/prospection/${encodeURIComponent(p.id)}`}>{p.name}</Link></td>
          <td>{p.city}</td>
          <td>{emailCell(p)}</td>
        </tr>)}
      </tbody></table></div>
      {loading ? <p role="status">Chargement des prospects…</p> : !visible.length && <p>Aucune entreprise à afficher.</p>}
    </section>
  </div>;
}
