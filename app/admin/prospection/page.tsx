"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { prospectRequest } from "@/lib/prospection/client";
import { RESULT_STATES, resultState, importableIndices, googleRatingLabel, type IgnoredPlace, normalize, SECTORS, STATUSES, type Prospect, type ProspectFields as Fields, type SearchResult, type SearchInput } from "@/lib/prospection/model";
import { ProspectFields } from "@/components/admin/prospection/ProspectFields";
import { ProspectionSettings } from "@/components/admin/prospection/ProspectionSettings";
import { emailRequest, type EnrichmentBatch } from "@/lib/prospection/emailClient";
import s from "./prospection.module.css";

export default function ProspectionPage() {
  const [emailSelection, setEmailSelection] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState("");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"list" | "add" | "search" | "ignored">("list");
  const [ignored, setIgnored] = useState<IgnoredPlace[]>([]);
  const [resultFilter, setResultFilter] = useState("");
  const [draft, setDraft] = useState<Partial<Fields>>({});
  const [filters, setFilters] = useState({ status: "", category: "", city: "", source: "", date: "", query: "" });
  const [search, setSearch] = useState<SearchInput>({ location: "Dunkerque", radius: 15, categories: ["restaurants"], limit: 50 });
  const [lastSearch, setLastSearch] = useState<SearchInput | null>(null);
  const [excludedCount, setExcludedCount] = useState(0);
  const [onlyNewBatch, setOnlyNewBatch] = useState(false);
  const [available, setAvailable] = useState(false); const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]); const [selection, setSelection] = useState<Set<number>>(new Set());
  const reload = useCallback(async () => { const data = await prospectRequest<{ prospects: Prospect[]; ignored: IgnoredPlace[]; searchAvailable: boolean }>(); setProspects(data.prospects); setIgnored(data.ignored); setAvailable(data.searchAvailable); }, []);
  useEffect(() => { reload().catch(error => setError(error.message)).finally(() => setLoading(false)); }, [reload]);
  async function run(work: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await work(); } catch (error) { setError(error instanceof Error ? error.message : "L’opération a échoué."); } finally { setBusy(false); } }
  const filtered = prospects.filter(p => (!filters.status || p.status === filters.status) && (!filters.category || p.category === filters.category) && (!filters.city || normalize(p.city).includes(normalize(filters.city))) && (!filters.source || p.source === filters.source) && (!filters.date || p.created_at.slice(0, 10) === filters.date) && (!filters.query || normalize([p.name, p.address, p.city, p.email, p.contact_name, p.phone].join(" ")).includes(normalize(filters.query))));
  const selectable = importableIndices(results);
  const selected = selectable.filter(index => selection.has(index));
  async function enrichSelection() {
    const ids = [...emailSelection];
    setProgress(`0 / ${ids.length} analysés`);
    const totals = { found: 0, not_found: 0, failed: 0, emails: 0 };
    for (let offset = 0; offset < ids.length; offset += 3) {
      const chunk = ids.slice(offset, offset + 3);
      try {
        const result = await emailRequest<EnrichmentBatch>({ action: "enrich_batch", ids: chunk });
        for (const key of ["found", "not_found", "failed", "emails"] as const) totals[key] += result[key];
      } catch { totals.failed += chunk.length; }
      setProgress(Math.min(offset + 3, ids.length) + " / " + ids.length + " analysés — " + totals.emails + " emails trouvés, " + totals.found + " prospects avec email, " + totals.not_found + " sans email public, " + totals.failed + " échecs");
    }
    await reload();
  }
  async function discover(input: SearchInput, onlyNew = false) {
    const data = await prospectRequest<{ results: SearchResult[]; excludedCount: number }>("POST", { action: "search", ...input, onlyNew });
    setResults(data.results); setSelection(new Set()); setResultFilter(""); setExcludedCount(data.excludedCount);
    setLastSearch(input); setOnlyNewBatch(onlyNew); setSearched(true);
    await reload();
  }
  async function refreshResults() {
    const data = await prospectRequest<{ results: SearchResult[] }>("POST", { action: "annotate", selection: results });
    setResults(data.results); setSelection(previous => new Set(importableIndices(data.results).filter(index => previous.has(index))));
    await reload();
  }
  async function reactivate(placeId: string) {
    await prospectRequest("POST", { action: "reactivate", placeId }); await refreshResults(); setNotice("Établissement réactivé.");
  }
  return <div className={s.module}>
    <ProspectionSettings />
    <header className={s.toolbar}><div><h1>Prospection</h1><p className={s.muted}>Qualifier les entreprises et organiser le suivi commercial. Aucun envoi automatique.</p></div><div className={s.actions}><button onClick={() => setTab("ignored")}>Ignorés ({ignored.length})</button><button onClick={() => setTab("search")}>Rechercher des entreprises</button><button className={s.primary} onClick={() => setTab("add")}>+ Ajouter un prospect</button></div></header>
    {error && <p role="alert" className={s.error}>{error}</p>}{notice && <p role="status" className={s.notice}>{notice}</p>}
    {loading ? <p role="status">Chargement des prospects…</p> : <div className={s.cards}>{Object.entries(STATUSES).map(([key, label]) => <button key={key} onClick={() => { setFilters({ ...filters, status: key }); setTab("list"); }}><span>{label}</span><strong>{prospects.filter(p => p.status === key).length}</strong></button>)}</div>}
    {tab !== "list" && <div><button onClick={() => setTab("list")}>← Liste des prospects</button></div>}
    {tab === "add" && <form className={s.module} onSubmit={event => { event.preventDefault(); void run(async () => { await prospectRequest("POST", { action: "create", fields: draft }); setDraft({}); setTab("list"); await reload(); setNotice("Prospect ajouté."); }); }}>
      <ProspectFields value={draft} onChange={setDraft} /><section className={s.panel}><label>Notes<textarea maxLength={10000} value={draft.notes || ""} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label></section><div><button disabled={busy} className={s.primary}>Enregistrer le prospect</button></div>
    </form>}
    {tab === "search" && <section className={s.panel}><h2>Recherche d’entreprises</h2>{!available && <p className={s.notice}>La recherche Google Places n’est pas configurée. L’ajout manuel est disponible.</p>}
      <form className={s.module} onSubmit={event => { event.preventDefault(); void run(() => discover(search)); }}>
        <div className={s.filters}><label>Localisation<input required value={search.location} onChange={event => setSearch({ ...search, location: event.target.value })} /></label><label>Rayon (km)<input type="number" min={1} max={50} required value={search.radius} onChange={event => setSearch({ ...search, radius: Number(event.target.value) })} /></label><label>Nombre de résultats<select value={search.limit} onChange={event => setSearch({ ...search, limit: Number(event.target.value) })}>{[20, 50].map(limit => <option key={limit} value={limit}>Jusqu’à {limit}</option>)}</select></label></div>
        <fieldset><legend>Secteurs</legend><div className={s.actions}>{SECTORS.map(category => <label key={category} className={s.check}><input type="checkbox" checked={search.categories.includes(category)} onChange={event => setSearch({ ...search, categories: event.target.checked ? [...search.categories, category] : search.categories.filter(value => value !== category) })} />{category}</label>)}</div></fieldset>
        <div><button disabled={busy || !available || !search.categories.length} className={s.primary}>Rechercher</button></div>
      </form>
      {searched && <>{lastSearch && <div className={s.actions}><button disabled={busy || !available} onClick={() => void run(() => discover({ ...lastSearch, limit: 50 }, true))}>Trouver 50 nouvelles entreprises</button><span className={s.muted}>{lastSearch.location} · {lastSearch.radius} km · {lastSearch.categories.join(", ")}</span></div>}{onlyNewBatch && !results.length && <p>Aucune nouvelle entreprise trouvée dans les limites de cette recherche. Essayez un autre secteur ou adaptez la zone.</p>}<p className={s.muted}>{selectable.length} nouvelles entreprises trouvées · Source : Google Maps.{!onlyNewBatch && results.length > selectable.length && ` ${results.length - selectable.length} établissements déjà traités dans ce lot.`}{excludedCount > 0 && ` ${excludedCount} établissements déjà connus ont été écartés.`}</p><div className={s.actions}><button disabled={busy || !selectable.length} onClick={() => setSelection(new Set(selectable))}>Tout sélectionner</button><button disabled={busy || !selected.length} onClick={() => setSelection(new Set())}>Désélectionner</button><button className={s.primary} disabled={busy || !selected.length} onClick={() => void run(async () => {
        const imported = await prospectRequest<{ created: string[]; skipped: { name: string }[] }>("POST", { action: "import", selection: selected.map(index => results[index]) });
        setSelection(new Set()); await refreshResults(); setNotice(`${imported.created.length} prospect(s) ajouté(s). ${imported.skipped.length} doublon(s) bloqué(s)${imported.skipped.length ? ` : ${imported.skipped.map(item => item.name).join(", ")}` : "."}`);
      })}>Ajouter la sélection ({selected.length})</button></div>
      <label>Afficher<select value={resultFilter} onChange={event => setResultFilter(event.target.value)}><option value="">Tous</option>{Object.entries(RESULT_STATES).map(([key, label]) => <option key={key} value={key}>{key === "new" ? "Nouveaux uniquement" : label}</option>)}</select></label><div className={s.table}><table><thead><tr><th>Sélection</th><th>Entreprise / activité</th><th>Ville / adresse</th><th>Coordonnées</th><th>Vérification</th></tr></thead><tbody>{results.map((result, index) => (!resultFilter || resultState(result) === resultFilter) && <tr key={result.google_place_id || index}><td><input aria-label={`Sélectionner ${result.name}`} type="checkbox" disabled={busy || Boolean(result.duplicate)} checked={!result.duplicate && selection.has(index)} onChange={event => setSelection(previous => { const next = new Set(previous); if (event.target.checked) next.add(index); else next.delete(index); return next; })} /></td><td>{result.name}<p className={s.muted}>{result.category}</p>{googleRatingLabel(result) && <p>{googleRatingLabel(result)}</p>}</td><td>{result.city}<p className={s.muted}>{result.address}</p></td><td>{result.phone || "—"}{result.website && <p><a href={result.website} target="_blank" rel="noreferrer">Ouvrir le site ↗</a></p>}</td><td>{RESULT_STATES[resultState(result)]}{!result.duplicate && result.google_place_id && <p><button disabled={busy} onClick={() => void run(async () => { await prospectRequest("POST", { action: "ignore", fields: result }); await refreshResults(); setNotice("Établissement ignoré. Vous pouvez le réactiver depuis Ignorés."); })}>Ignorer</button></p>}{result.duplicate?.kind === "ignored" && <p><button disabled={busy} onClick={() => void run(() => reactivate(result.google_place_id))}>Réactiver</button></p>}</td></tr>)}</tbody></table></div></>}
    </section>}
    {tab === "ignored" && <section className={s.panel}><h2>Établissements ignorés</h2><p className={s.muted}>Exclus des imports jusqu’à leur réactivation.</p><button disabled={busy} onClick={() => void run(reload)}>Actualiser</button><div className={s.table}><table><thead><tr><th>Entreprise</th><th>Ville</th><th>Ignoré le</th><th>Action</th></tr></thead><tbody>{ignored.map(place => <tr key={place.google_place_id}><td>{place.name}{googleRatingLabel(place) && <p>{googleRatingLabel(place)}</p>}</td><td>{place.city}</td><td>{new Date(place.ignored_at).toLocaleDateString("fr-FR")}</td><td><button disabled={busy} onClick={() => void run(() => reactivate(place.google_place_id))}>Réactiver</button></td></tr>)}</tbody></table></div>{!ignored.length && <p>Aucun établissement ignoré.</p>}</section>}
    {tab === "list" && <section className={s.panel}><div className={s.filters}>
      <label>Recherche texte<input placeholder="Entreprise, contact, email…" value={filters.query} onChange={e => setFilters({ ...filters, query: e.target.value })} /></label>
      <label>Statut<select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">Tous les statuts</option>{Object.entries(STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Secteur<select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}><option value="">Tous les secteurs</option>{[...new Set(prospects.map(p => p.category).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Ville<input value={filters.city} onChange={e => setFilters({ ...filters, city: e.target.value })} /></label>
      <label>Source<select value={filters.source} onChange={e => setFilters({ ...filters, source: e.target.value })}><option value="">Toutes les sources</option>{[...new Set(prospects.map(p => p.source))].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Date d’ajout<input type="date" value={filters.date} onChange={e => setFilters({ ...filters, date: e.target.value })} /></label>
    </div><div className={s.toolbar}><p className={s.muted}>{filtered.length} prospect(s)</p><button onClick={() => setFilters({ status: "", category: "", city: "", source: "", date: "", query: "" })}>Réinitialiser les filtres</button><button disabled={busy} onClick={() => void run(reload)}>Actualiser</button></div>
      <div className={s.actions}><button disabled={busy || !filtered.length} onClick={() => setEmailSelection(new Set(filtered.slice(0, 50).map(p => p.id)))}>Sélectionner les prospects affichés (50 max.)</button><button disabled={busy} onClick={() => setEmailSelection(new Set())}>Désélectionner</button><button disabled={busy || !emailSelection.size} onClick={() => void run(enrichSelection)}>Rechercher les emails ({emailSelection.size})</button></div>
      {progress && <p role="status">{progress}</p>}
      <div className={s.table}><table><thead><tr><th>Sélection</th><th>Entreprise</th><th>Secteur / ville</th><th>Statut</th><th>Prochaine relance</th><th>Source</th><th>Ajout</th></tr></thead><tbody>{filtered.map(p => <tr key={p.id}><td><input type="checkbox" aria-label={"Rechercher l’email de " + p.name} disabled={busy || (!emailSelection.has(p.id) && emailSelection.size >= 50)} checked={emailSelection.has(p.id)} onChange={e => setEmailSelection(previous => { const next = new Set(previous); if (e.target.checked) next.add(p.id); else next.delete(p.id); return next; })} /></td><td><Link className={s.link} href={`/admin/prospection/${p.id}`}>{p.name}</Link></td><td>{p.category || "—"}<p className={s.muted}>{p.city}</p></td><td><span className={s.badge}>{STATUSES[p.status]}</span></td><td>{p.next_follow_up_at ? new Date(p.next_follow_up_at).toLocaleString("fr-FR") : "—"}</td><td>{p.source}</td><td>{new Date(p.created_at).toLocaleDateString("fr-FR")}</td></tr>)}</tbody></table></div>{!loading && !filtered.length && <p>Aucun prospect à afficher. Ajoutez une entreprise ou adaptez les filtres.</p>}
    </section>}
    {busy && <p role="status">Opération en cours…</p>}
  </div>;
}
