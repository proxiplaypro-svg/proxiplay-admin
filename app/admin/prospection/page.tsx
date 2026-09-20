"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { prospectRequest } from "@/lib/prospection/client";
import { normalize, SECTORS, STATUSES, type Prospect, type ProspectFields as Fields, type SearchResult, type SearchInput } from "@/lib/prospection/model";
import { ProspectFields } from "@/components/admin/prospection/ProspectFields";
import s from "./prospection.module.css";

export default function ProspectionPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"list" | "add" | "search">("list");
  const [draft, setDraft] = useState<Partial<Fields>>({});
  const [filters, setFilters] = useState({ status: "", category: "", city: "", source: "", date: "", query: "" });
  const [search, setSearch] = useState<SearchInput>({ location: "Dunkerque", radius: 15, categories: ["restaurants"], limit: 20 });
  const [available, setAvailable] = useState(false); const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]); const [selection, setSelection] = useState<Set<number>>(new Set());
  const reload = useCallback(async () => { const data = await prospectRequest<{ prospects: Prospect[]; searchAvailable: boolean }>(); setProspects(data.prospects); setAvailable(data.searchAvailable); }, []);
  useEffect(() => { reload().catch(error => setError(error.message)).finally(() => setLoading(false)); }, [reload]);
  async function run(work: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await work(); } catch (error) { setError(error instanceof Error ? error.message : "L’opération a échoué."); } finally { setBusy(false); } }
  const filtered = prospects.filter(p => (!filters.status || p.status === filters.status) && (!filters.category || p.category === filters.category) && (!filters.city || normalize(p.city).includes(normalize(filters.city))) && (!filters.source || p.source === filters.source) && (!filters.date || p.created_at.slice(0, 10) === filters.date) && (!filters.query || normalize([p.name, p.address, p.city, p.email, p.contact_name, p.phone].join(" ")).includes(normalize(filters.query))));
  const selectable = results.map((result, index) => result.duplicate ? -1 : index).filter(index => index >= 0);
  return <div className={s.module}>
    <header className={s.toolbar}><div><h1>Prospection</h1><p className={s.muted}>Qualifier les entreprises et organiser le suivi commercial. Aucun envoi automatique.</p></div><div className={s.actions}><button onClick={() => setTab("search")}>Rechercher des entreprises</button><button className={s.primary} onClick={() => setTab("add")}>+ Ajouter un prospect</button></div></header>
    {error && <p role="alert" className={s.error}>{error}</p>}{notice && <p role="status" className={s.notice}>{notice}</p>}
    {loading ? <p role="status">Chargement des prospects…</p> : <div className={s.cards}>{Object.entries(STATUSES).map(([key, label]) => <button key={key} onClick={() => { setFilters({ ...filters, status: key }); setTab("list"); }}><span>{label}</span><strong>{prospects.filter(p => p.status === key).length}</strong></button>)}</div>}
    {tab !== "list" && <div><button onClick={() => setTab("list")}>← Liste des prospects</button></div>}
    {tab === "add" && <form className={s.module} onSubmit={event => { event.preventDefault(); void run(async () => { await prospectRequest("POST", { action: "create", fields: draft }); setDraft({}); setTab("list"); await reload(); setNotice("Prospect ajouté."); }); }}>
      <ProspectFields value={draft} onChange={setDraft} /><section className={s.panel}><label>Notes<textarea maxLength={10000} value={draft.notes || ""} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label></section><div><button disabled={busy} className={s.primary}>Enregistrer le prospect</button></div>
    </form>}
    {tab === "search" && <section className={s.panel}><h2>Recherche d’entreprises</h2>{!available && <p className={s.notice}>La recherche Google Places n’est pas configurée. L’ajout manuel est disponible.</p>}
      <form className={s.module} onSubmit={event => { event.preventDefault(); void run(async () => { setResults([]); setSelection(new Set()); setSearched(false); const data = await prospectRequest<{ results: SearchResult[] }>("POST", { action: "search", ...search }); setResults(data.results); setSearched(true); }); }}>
        <div className={s.filters}><label>Localisation<input required value={search.location} onChange={event => setSearch({ ...search, location: event.target.value })} /></label><label>Rayon (km)<input type="number" min={1} max={50} required value={search.radius} onChange={event => setSearch({ ...search, radius: Number(event.target.value) })} /></label><label>Maximum de résultats<input type="number" min={1} max={60} required value={search.limit} onChange={event => setSearch({ ...search, limit: Number(event.target.value) })} /></label></div>
        <fieldset><legend>Secteurs</legend><div className={s.actions}>{SECTORS.map(category => <label key={category} className={s.check}><input type="checkbox" checked={search.categories.includes(category)} onChange={event => setSearch({ ...search, categories: event.target.checked ? [...search.categories, category] : search.categories.filter(value => value !== category) })} />{category}</label>)}</div></fieldset>
        <div><button disabled={busy || !available || !search.categories.length} className={s.primary}>Rechercher</button></div>
      </form>
      {searched && <><p className={s.muted}>{results.length} résultat(s) · Source : Google Maps. Aucun prospect enregistré avant votre sélection.</p><div className={s.actions}><button disabled={busy || !selectable.length} onClick={() => setSelection(new Set(selectable))}>Tout sélectionner</button><button disabled={busy || !selection.size} onClick={() => setSelection(new Set())}>Désélectionner</button><button className={s.primary} disabled={busy || !selection.size} onClick={() => void run(async () => {
        const imported = await prospectRequest<{ created: string[]; skipped: { name: string }[] }>("POST", { action: "import", selection: [...selection].map(index => results[index]) });
        setResults([]); setSelection(new Set()); setSearched(false); await reload(); setNotice(`${imported.created.length} prospect(s) ajouté(s). ${imported.skipped.length} doublon(s) bloqué(s)${imported.skipped.length ? ` : ${imported.skipped.map(item => item.name).join(", ")}` : "."}`);
      })}>Ajouter la sélection ({selection.size})</button></div>
      <div className={s.table}><table><thead><tr><th>Sélection</th><th>Entreprise / activité</th><th>Ville / adresse</th><th>Coordonnées</th><th>Vérification</th></tr></thead><tbody>{results.map((result, index) => <tr key={result.google_place_id || index}><td><input aria-label={`Sélectionner ${result.name}`} type="checkbox" disabled={busy || Boolean(result.duplicate)} checked={selection.has(index)} onChange={event => setSelection(previous => { const next = new Set(previous); if (event.target.checked) next.add(index); else next.delete(index); return next; })} /></td><td>{result.name}<p className={s.muted}>{result.category}</p></td><td>{result.city}<p className={s.muted}>{result.address}</p></td><td>{result.phone || "—"}{result.website && <p><a href={result.website} target="_blank" rel="noreferrer">Ouvrir le site ↗</a></p>}</td><td>{result.duplicate ? result.duplicate.kind === "client" ? "Déjà client Proxiplay" : "Déjà présent / doublon possible" : "Nouveau"}</td></tr>)}</tbody></table></div></>}
    </section>}
    {tab === "list" && <section className={s.panel}><div className={s.filters}>
      <label>Recherche texte<input placeholder="Entreprise, contact, email…" value={filters.query} onChange={e => setFilters({ ...filters, query: e.target.value })} /></label>
      <label>Statut<select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">Tous les statuts</option>{Object.entries(STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Secteur<select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}><option value="">Tous les secteurs</option>{[...new Set(prospects.map(p => p.category).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Ville<input value={filters.city} onChange={e => setFilters({ ...filters, city: e.target.value })} /></label>
      <label>Source<select value={filters.source} onChange={e => setFilters({ ...filters, source: e.target.value })}><option value="">Toutes les sources</option>{[...new Set(prospects.map(p => p.source))].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Date d’ajout<input type="date" value={filters.date} onChange={e => setFilters({ ...filters, date: e.target.value })} /></label>
    </div><div className={s.toolbar}><p className={s.muted}>{filtered.length} prospect(s)</p><button onClick={() => setFilters({ status: "", category: "", city: "", source: "", date: "", query: "" })}>Réinitialiser les filtres</button><button disabled={busy} onClick={() => void run(reload)}>Actualiser</button></div>
      <div className={s.table}><table><thead><tr><th>Entreprise</th><th>Secteur / ville</th><th>Statut</th><th>Prochaine relance</th><th>Source</th><th>Ajout</th></tr></thead><tbody>{filtered.map(p => <tr key={p.id}><td><Link className={s.link} href={`/admin/prospection/${p.id}`}>{p.name}</Link></td><td>{p.category || "—"}<p className={s.muted}>{p.city}</p></td><td><span className={s.badge}>{STATUSES[p.status]}</span></td><td>{p.next_follow_up_at ? new Date(p.next_follow_up_at).toLocaleString("fr-FR") : "—"}</td><td>{p.source}</td><td>{new Date(p.created_at).toLocaleDateString("fr-FR")}</td></tr>)}</tbody></table></div>{!loading && !filtered.length && <p>Aucun prospect à afficher. Ajoutez une entreprise ou adaptez les filtres.</p>}
    </section>}
    {busy && <p role="status">Opération en cours…</p>}
  </div>;
}
