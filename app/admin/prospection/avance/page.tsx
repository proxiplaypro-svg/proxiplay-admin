"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prospectRequest } from "@/lib/prospection/client";
import {
  COMMERCIAL_PRIORITIES,
  RESULT_STATES,
  resultState,
  importableIndices,
  googleRatingLabel,
  type IgnoredPlace,
  SECTORS,
  STATUSES,
  type Prospect,
  type ProspectFields as Fields,
  type SearchResult,
  type SearchInput,
} from "@/lib/prospection/model";
import {
  commercialCategory,
  EMPTY_FILTERS,
  isFollowUpDue,
  matchesProspectFilters,
  prospectEmailSummary,
  PROSPECTS_CHANGED,
} from "@/lib/prospection/list";
import {
  isCampaignEmailEligible,
  prospectRecipient,
} from "@/lib/prospection/emailRecipient";
import { ProspectList } from "@/components/admin/prospection/ProspectList";
import { ProspectFields } from "@/components/admin/prospection/ProspectFields";
import { ProspectBulkEmail } from "@/components/admin/prospection/ProspectBulkEmail";
import { ProspectionSettings } from "@/components/admin/prospection/ProspectionSettings";
import {
  emailRequest,
  type EnrichmentBatch,
} from "@/lib/prospection/emailClient";
import { relevance } from "@/lib/prospection/relevance";
import { PROXIPLAY_CATEGORY_PRESETS } from "@/lib/prospection/searchConfig";
import Link from "next/link";
import s from "../prospection.module.css";

type View = "dashboard" | "companies" | "emails" | "campaigns" | "actions" | "prospects";
type CompanyPanel = "list" | "add" | "search" | "ignored";
type Filters = typeof EMPTY_FILTERS;

function ProspectFilters({
  filters,
  update,
  prospects,
  showStatus = false,
  showEmail = false,
}: {
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  prospects: Prospect[];
  showStatus?: boolean;
  showEmail?: boolean;
}) {
  return (
    <div className={s.filters}>
      <label>
        Recherche texte
        <input
          placeholder="Entreprise, contact, email…"
          value={filters.query}
          onChange={(e) => update({ query: e.target.value })}
        />
      </label>
      {showStatus && (
        <label>
          Statut
          <select
            value={filters.status}
            onChange={(e) => update({ status: e.target.value })}
          >
            <option value="">Tous les statuts</option>
            {Object.entries(STATUSES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      {showEmail && (
        <label>
          Email
          <select
            value={filters.email}
            onChange={(e) => update({ email: e.target.value })}
          >
            <option value="">Tous</option>
            <option value="found">Contactables par email</option>
            <option value="missing">Non contactables par email</option>
          </select>
        </label>
      )}
      <label>
        Priorité
        <select
          value={filters.priority}
          onChange={(e) => update({ priority: e.target.value })}
        >
          <option value="">Toutes</option>
          {Object.entries(COMMERCIAL_PRIORITIES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Secteur
        <select
          value={filters.category}
          onChange={(e) => update({ category: e.target.value })}
        >
          <option value="">Tous les secteurs</option>
          {[...new Set(prospects.map((p) => p.category).filter(Boolean))]
            .sort()
            .map((value) => (
              <option key={value}>{value}</option>
            ))}
        </select>
      </label>
      <label>
        Ville
        <input
          value={filters.city}
          onChange={(e) => update({ city: e.target.value })}
        />
      </label>
      <label>
        Source
        <select
          value={filters.source}
          onChange={(e) => update({ source: e.target.value })}
        >
          <option value="">Toutes les sources</option>
          {[...new Set(prospects.map((p) => p.source))].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function IgnoredPlaces({
  places,
  busy,
  onBack,
  onReload,
  onReactivate,
}: {
  places: IgnoredPlace[];
  busy: boolean;
  onBack: () => void;
  onReload: () => void;
  onReactivate: (id: string) => void;
}) {
  return (
    <section className={s.panel}>
      <div className={s.toolbar}>
        <div>
          <h2>Établissements ignorés</h2>
          <p className={s.muted}>
            Exclus des imports jusqu’à leur réactivation.
          </p>
        </div>
        <div className={s.actions}>
          <button onClick={onBack}>← Mes prospects</button>
          <button disabled={busy} onClick={onReload}>
            Actualiser
          </button>
        </div>
      </div>
      <div className={s.table}>
        <table>
          <thead>
            <tr>
              <th>Entreprise</th>
              <th>Ville</th>
              <th>Ignoré le</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {places.map((place) => (
              <tr key={place.google_place_id}>
                <td>
                  {place.name}
                  {googleRatingLabel(place) && (
                    <p>{googleRatingLabel(place)}</p>
                  )}
                </td>
                <td>{place.city}</td>
                <td>
                  {new Date(place.ignored_at).toLocaleDateString("fr-FR")}
                </td>
                <td>
                  <button
                    disabled={busy}
                    onClick={() => onReactivate(place.google_place_id)}
                  >
                    Réactiver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!places.length && <p>Aucun établissement ignoré.</p>}
    </section>
  );
}

function TodayActions({
  prospects,
  busy,
  onCall,
  onReply,
}: {
  prospects: Prospect[];
  busy: boolean;
  onCall: (p: Prospect) => void;
  onReply: (p: Prospect) => void;
}) {
  return (
    <ul className={s.prospectList}>
      {prospects.map((p) => (
        <li className={`${s.prospectRow} ${s.prospectRowStatic}`} key={p.id}>
          <div className={s.prospectInfo}>
            <Link
              className={s.companyName}
              href={`/admin/prospection/${encodeURIComponent(p.id)}`}
              title={p.name}
            >
              {p.name}
            </Link>
            <div className={s.rowMeta}>
              <span className={s.badge}>
                {COMMERCIAL_PRIORITIES[p.commercial_priority || "medium"]}
              </span>
              <span>
                {p.next_follow_up_at
                  ? `Échue le ${new Date(p.next_follow_up_at).toLocaleDateString("fr-FR")}`
                  : "Relance J+7 échue"}
              </span>
            </div>
          </div>
          <div className={s.rowActions}>
            <Link
              className={s.link}
              href={`/admin/prospection/${encodeURIComponent(p.id)}`}
            >
              Consulter
            </Link>
            <Link
              className={`${s.link} ${s.primary}`}
              href={`/admin/prospection/${encodeURIComponent(p.id)}#proposition`}
            >
              Préparer la relance
            </Link>
            <button disabled={busy} onClick={() => onCall(p)}>
              Appel fait
            </button>
            <button disabled={busy} onClick={() => onReply(p)}>
              Noter réponse
            </button>
            <Link
              className={s.link}
              href={`/admin/prospection/${encodeURIComponent(p.id)}#suivi`}
            >
              Planifier / RDV
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function UnifiedProspectionPage({
  initialView = "prospects",
  legacy = false,
}: {
  initialView?: View;
  legacy?: boolean;
}) {
  const [view, setView] = useState<View>(initialView);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [companyPanel, setCompanyPanel] = useState<CompanyPanel>("list");
  const [emailSelection, setEmailSelection] = useState<Set<string>>(new Set());
  const [campaignSelection, setCampaignSelection] = useState<Set<string>>(
    new Set(),
  );
  const [progress, setProgress] = useState("");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ignored, setIgnored] = useState<IgnoredPlace[]>([]);
  const [resultFilter, setResultFilter] = useState("");
  const [draft, setDraft] = useState<Partial<Fields>>({});
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [emailFilters, setEmailFilters] = useState<Filters>({
    ...EMPTY_FILTERS,
    email: "not_started",
  });
  const [campaignFilters, setCampaignFilters] = useState<Filters>({
    ...EMPTY_FILTERS,
    email: "found",
  });
  const [campaignStatus, setCampaignStatus] = useState("new");
  const [campaignKind, setCampaignKind] = useState<"initial" | "follow_up">(
    "initial",
  );
  const [campaignScore, setCampaignScore] = useState(0);
  const [campaignHistory, setCampaignHistory] = useState<
    "all" | "never" | "contacted"
  >("all");
  const [search, setSearch] = useState<SearchInput>({
    location: "Dunkerque",
    radius: 15,
    categories: ["restaurants"],
    limit: 50,
  });
  const [lastSearch, setLastSearch] = useState<SearchInput | null>(null);
  const [excludedCount, setExcludedCount] = useState(0);
  const [searchMetrics, setSearchMetrics] = useState<{
    googleCalls: number;
    callBudget: number;
    budgetReached: boolean;
  } | null>(null);
  const [available, setAvailable] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const reloadVersion = useRef(0);
  const reload = useCallback(async () => {
    const version = ++reloadVersion.current;
    const data = await prospectRequest<{
      prospects: Prospect[];
      ignored: IgnoredPlace[];
      searchAvailable: boolean;
    }>();
    if (version !== reloadVersion.current) return;
    setProspects(data.prospects);
    setIgnored(data.ignored);
    setAvailable(data.searchAvailable);
  }, []);
  useEffect(() => {
    reload()
      .catch((error) => setError(error.message))
      .finally(() => setLoading(false));
  }, [reload]);
  useEffect(() => {
    const refresh = () => {
      void reload().catch((error) => setError(error.message));
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const changed = (event: StorageEvent) => {
      if (event.key === PROSPECTS_CHANGED) refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener(PROSPECTS_CHANGED, refresh);
    window.addEventListener("storage", changed);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener(PROSPECTS_CHANGED, refresh);
      window.removeEventListener("storage", changed);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [reload]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "L’opération a échoué.",
      );
    } finally {
      setBusy(false);
    }
  }
  const updateFilters = (patch: Partial<Filters>) =>
    setFilters({ ...filters, ...patch });
  const updateEmailFilters = (patch: Partial<Filters>) =>
    setEmailFilters({ ...emailFilters, ...patch });
  const updateCampaignFilters = (patch: Partial<Filters>) =>
    setCampaignFilters({ ...campaignFilters, ...patch });
  const [companySort, setCompanySort] = useState<
    "priority" | "relevance" | "contacts"
  >("priority");
  const priorityRank = (p: Prospect) =>
    ({ high: 0, medium: 1, low: 2 })[p.commercial_priority || "medium"];
  const sortProspects = (items: Prospect[]) =>
    [...items].sort((a, b) =>
      companySort === "relevance"
        ? relevance(b).score - relevance(a).score
        : companySort === "contacts"
          ? Object.values(relevance(b).channels).filter(Boolean).length -
            Object.values(relevance(a).channels).filter(Boolean).length
          : priorityRank(a) - priorityRank(b),
    );
  const withoutEmailFilter = prospects.filter((p) =>
    matchesProspectFilters(p, { ...filters, email: "" }),
  );
  const filtered = sortProspects(
    withoutEmailFilter.filter(
      (p) => !filters.email || prospectEmailSummary(p).state === filters.email,
    ),
  );
  const emailCandidates = prospects.filter((p) =>
    matchesProspectFilters(p, { ...emailFilters, email: "" }),
  );
  const emailWork = emailCandidates.filter(
    (p) => prospectEmailSummary(p).state === emailFilters.email,
  );
  const campaignProspects = prospects.filter(
    (p) =>
      matchesProspectFilters(p, {
        ...campaignFilters,
        status: "",
        email: "",
      }) &&
      (!campaignStatus || commercialCategory(p) === campaignStatus) &&
      relevance(p).score >= campaignScore &&
      (campaignHistory === "all" ||
        (campaignHistory === "never" && !p.last_contact_at) ||
        (campaignHistory === "contacted" && Boolean(p.last_contact_at))) &&
      (campaignKind === "follow_up"
        ? Boolean(prospectRecipient(p)) &&
          !p.do_not_contact &&
          !p.email_sending_id &&
          isFollowUpDue(p)
        : isCampaignEmailEligible(p) && !p.last_contact_at),
  );
  const selectable = importableIndices(results);
  const selected = selectable.filter((index) => selection.has(index));
  const emailCounts = {
    found: emailCandidates.filter(
      (p) => prospectEmailSummary(p).state === "found",
    ).length,
    notFound: emailCandidates.filter(
      (p) => prospectEmailSummary(p).state === "not_found",
    ).length,
    failed: emailCandidates.filter(
      (p) => prospectEmailSummary(p).state === "failed",
    ).length,
    notStarted: emailCandidates.filter(
      (p) => prospectEmailSummary(p).state === "not_started",
    ).length,
    running: emailCandidates.filter(
      (p) => prospectEmailSummary(p).state === "running",
    ).length,
  };
  const dueToday = prospects
    .filter((p) => isFollowUpDue(p))
    .sort(
      (a, b) =>
        Date.parse(a.next_follow_up_at || a.last_contact_at || a.created_at) -
          Date.parse(
            b.next_follow_up_at || b.last_contact_at || b.created_at,
          ) || priorityRank(a) - priorityRank(b),
    );
  const metrics = {
    contacted: prospects.filter((p) => Boolean(p.last_contact_at)).length,
    replied: prospects.filter((p) => p.status === "replied").length,
    positive: prospects.filter((p) => ["meeting", "client"].includes(p.status))
      .length,
    meetings: prospects.filter((p) => p.status === "meeting").length,
    converted: prospects.filter((p) => p.status === "client").length,
  };
  const conversionRate = metrics.contacted
    ? Math.round((metrics.converted / metrics.contacted) * 100)
    : 0;
  const selectProspects = (ids: string[]) =>
    setEmailSelection(new Set(ids.slice(0, 50)));
  async function enrichSelection() {
    if (
      emailFilters.email === "failed" &&
      !window.confirm(
        `Réessayer ${emailSelection.size} échec(s) sélectionné(s) ? Les protections de sécurité restent actives.`,
      )
    )
      return;
    const ids = [...emailSelection];
    setProgress(`0 / ${ids.length} prospects analysés`);
    const totals = { found: 0, not_found: 0, failed: 0, emails: 0 };
    for (let offset = 0; offset < ids.length; offset += 3) {
      const chunk = ids.slice(offset, offset + 3);
      try {
        const result = await emailRequest<EnrichmentBatch>({
          action: "enrich_batch",
          ids: chunk,
        });
        for (const key of ["found", "not_found", "failed", "emails"] as const)
          totals[key] += result[key];
      } catch {
        totals.failed += chunk.length;
      }
      setProgress(
        `${Math.min(offset + 3, ids.length)} / ${ids.length} prospects analysés — ${totals.found} prospects avec email, ${totals.not_found} sans email, ${totals.failed} échecs, ${totals.emails} adresses email présentes`,
      );
    }
    await reload();
  }
  async function discover(input: SearchInput, onlyNew = false) {
    const data = await prospectRequest<{
      results: SearchResult[];
      excludedCount: number;
      searchMetrics?: {
        googleCalls: number;
        callBudget: number;
        budgetReached: boolean;
      };
    }>("POST", { action: "search", ...input, onlyNew });
    setSearchMetrics(data.searchMetrics || null);
    setResults(data.results);
    setSelection(new Set());
    setResultFilter("");
    setExcludedCount(data.excludedCount);
    setLastSearch(input);
    setSearched(true);
    await reload();
  }
  async function refreshResults() {
    const data = await prospectRequest<{ results: SearchResult[] }>("POST", {
      action: "annotate",
      selection: results,
    });
    setResults(data.results);
    setSelection(
      (previous) =>
        new Set(
          importableIndices(data.results).filter((index) =>
            previous.has(index),
          ),
        ),
    );
    await reload();
  }
  async function reactivate(placeId: string) {
    await prospectRequest("POST", { action: "reactivate", placeId });
    await refreshResults();
    setNotice("Établissement réactivé.");
  }
  const retryEmail = (id: string) =>
    void run(async () => {
      await emailRequest({ action: "enrich", id });
      await reload();
    });
  const quickUpdate = (p: Prospect, patch: Partial<Fields>, label: string) =>
    void run(async () => {
      await prospectRequest(
        "PATCH",
        { action: "update", revision: p.revision, fields: { ...p, ...patch } },
        p.id,
      );
      await reload();
      setNotice(label);
    });

  return (
    <div className={s.module}>
      <header className={s.sectionHeading}>
        <div className={s.pageHeader}>
          <h1>Prospection</h1>
          <p className={s.muted}>
            {legacy
              ? "Point d’entrée historique de la prospection."
              : "Pilotez vos contacts, relances et campagnes depuis un seul espace."}
          </p>
        </div>
        <div className={s.actions}>{legacy && (
            <Link className={s.link} href="/admin/prospection">
              Accueil Prospection
            </Link>
          )}
        </div>
      </header>
      <div
        className={s.tabs}
        role="tablist"
        aria-label="Navigation de prospection"
      >
        {(
          [
            ["dashboard", "Tableau de bord"],
            ["companies", "Recherche"],
            ["prospects", "Prospects"],
            ["campaigns", "Campagne"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={view === key ? s.tabActive : ""}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={s.notice}>
          {notice}
        </p>
      )}

      {view === "dashboard" && (
        <>
          <section className={s.sectionHeading}>
            <div>
              <h2>Tableau de bord commercial</h2>
              <p className={s.muted}>
                Indicateurs issus des fiches et historiques enregistrés ; aucune
                activité de boîte mail n’est déduite automatiquement.
              </p>
            </div>
          </section>
          <section className={s.cards} aria-label="Indicateurs de prospection">
            <button onClick={() => setView("companies")}>
              <span>Prospects</span>
              <strong>{prospects.length}</strong>
            </button>
            <button
              onClick={() => {
                updateEmailFilters({ email: "found" });
                setView("emails");
              }}
            >
              <span>Emails exploitables</span>
              <strong>{emailCounts.found}</strong>
            </button>
            <button onClick={() => setView("actions")}>
              <span>Relances dues</span>
              <strong>{dueToday.length}</strong>
            </button>
            <button onClick={() => setView("actions")}>
              <span>Réponses enregistrées</span>
              <strong>{metrics.replied}</strong>
            </button>
            <button onClick={() => setView("actions")}>
              <span>Rendez-vous</span>
              <strong>{metrics.meetings}</strong>
            </button>
            <button onClick={() => setView("actions")}>
              <span>Partenaires convertis</span>
              <strong>{metrics.converted}</strong>
            </button>
          </section>
          <section className={s.grid}>
            <article className={s.panel}>
              <h2>Actions prioritaires</h2>
              <p>{dueToday.length} relance(s) échue(s) à traiter.</p>
              <button className={s.primary} onClick={() => setView("actions")}>
                Voir les relances dues
              </button>
            </article>
            <article className={s.panel}>
              <h2>Recherche à reprendre</h2>
              <p>
                {emailCounts.failed} recherche(s) d’email en erreur
                récupérable(s).
              </p>
              <button
                onClick={() => {
                  updateEmailFilters({ email: "failed" });
                  setView("emails");
                }}
              >
                Voir les échecs
              </button>
            </article>
          </section>
        </>
      )}

      {view === "companies" && (
        <>
          <section className={s.sectionHeading}>
            <div>
              <h2>Entreprises</h2>
              <p className={s.muted}>
                Trouvez et ajoutez les entreprises que vous souhaitez
                prospecter.
              </p>
            </div>
            <div className={s.actions}>
              <button onClick={() => setCompanyPanel("ignored")}>
                Ignorés ({ignored.length})
              </button>
              <button onClick={() => setCompanyPanel("search")}>
                Rechercher sur Google
              </button>
              <button
                className={s.primary}
                onClick={() => setCompanyPanel("add")}
              >
                + Ajouter un prospect
              </button>
            </div>
          </section>
          {companyPanel === "add" && (
            <form
              className={s.module}
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await prospectRequest("POST", {
                    action: "create",
                    fields: draft,
                  });
                  setDraft({});
                  setCompanyPanel("list");
                  await reload();
                  setNotice("Prospect ajouté.");
                });
              }}
            >
              <div>
                <button type="button" onClick={() => setCompanyPanel("list")}>
                  ← Mes prospects
                </button>
              </div>
              <ProspectFields value={draft} onChange={setDraft} />
              <section className={s.panel}>
                <label>
                  Notes
                  <textarea
                    maxLength={10000}
                    value={draft.notes || ""}
                    onChange={(event) =>
                      setDraft({ ...draft, notes: event.target.value })
                    }
                  />
                </label>
              </section>
              <div>
                <button disabled={busy} className={s.primary}>
                  Enregistrer le prospect
                </button>
              </div>
            </form>
          )}
          {companyPanel === "search" && (
            <section className={s.panel}>
              <div className={s.toolbar}>
                <div>
                  <h2>Trouver de nouveaux prospects</h2>
                  <p className={s.muted}>
                    Recherchez des entreprises sur Google Places puis importez
                    celles qui vous intéressent.
                  </p>
                </div>
                <button onClick={() => setCompanyPanel("list")}>
                  ← Mes prospects
                </button>
              </div>
              {!available && (
                <p className={s.notice}>
                  La recherche Google Places n’est pas configurée. L’ajout
                  manuel reste disponible.
                </p>
              )}
              <form
                className={s.module}
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(() => discover(search));
                }}
              >
                <div className={s.filters}>
                  <label>
                    Ville / zone
                    <input
                      required
                      value={search.location}
                      onChange={(event) =>
                        setSearch({ ...search, location: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Rayon (km)
                    <input
                      type="number"
                      min={1}
                      max={50}
                      required
                      value={search.radius}
                      onChange={(event) =>
                        setSearch({
                          ...search,
                          radius: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Nombre de résultats
                    <select
                      value={search.limit}
                      onChange={(event) =>
                        setSearch({
                          ...search,
                          limit: Number(event.target.value),
                        })
                      }
                    >
                      {[20, 50].map((limit) => (
                        <option key={limit} value={limit}>
                          Jusqu’à {limit}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <fieldset>
                  <legend>Secteurs</legend>
                  <div className={s.actions}>
                    {SECTORS.map((category) => (
                      <label key={category} className={s.check}>
                        <input
                          type="checkbox"
                          checked={search.categories.includes(category)}
                          onChange={(event) =>
                            setSearch({
                              ...search,
                              categories: event.target.checked
                                ? [...search.categories, category]
                                : search.categories.filter(
                                    (value) => value !== category,
                                  ),
                            })
                          }
                        />
                        {category}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <button
                    disabled={busy || !available || !search.categories.length}
                    className={s.primary}
                  >
                    Rechercher sur Google
                  </button>
                </div>
              </form>
              {searched && (
                <>
                  <p className={s.muted}>
                    {selectable.length} nouvelles entreprises trouvées · Source
                    : Google Maps.
                    {excludedCount > 0 &&
                      ` ${excludedCount} établissements connus écartés.`}
                  </p>
                  {searchMetrics?.budgetReached && (
                    <p role="status">
                      Budget de recherche atteint : {searchMetrics.googleCalls}{" "}
                      appels sur {searchMetrics.callBudget}.
                    </p>
                  )}
                  {lastSearch && (
                    <div className={s.actions}>
                      <button
                        disabled={busy || !available}
                        onClick={() =>
                          void run(() =>
                            discover({ ...lastSearch, limit: 50 }, true),
                          )
                        }
                      >
                        Trouver 50 nouvelles entreprises
                      </button>
                      <span className={s.muted}>
                        {lastSearch.location} · {lastSearch.radius} km ·{" "}
                        {lastSearch.categories.join(", ")}
                      </span>
                    </div>
                  )}
                  <div className={s.actions}>
                    <button
                      disabled={busy || !selectable.length}
                      onClick={() => setSelection(new Set(selectable))}
                    >
                      Tout sélectionner
                    </button>
                    <button
                      disabled={busy || !selected.length}
                      onClick={() => setSelection(new Set())}
                    >
                      Désélectionner
                    </button>
                    <button
                      className={s.primary}
                      disabled={busy || !selected.length}
                      onClick={() =>
                        void run(async () => {
                          const imported = await prospectRequest<{
                            created: string[];
                            skipped: { name: string }[];
                          }>("POST", {
                            action: "import",
                            selection: selected.map((index) => results[index]),
                          });
                          setSelection(new Set());
                          await refreshResults();
                          setNotice(
                            `${imported.created.length} prospect(s) ajouté(s). ${imported.skipped.length} doublon(s) bloqué(s)${imported.skipped.length ? ` : ${imported.skipped.map((item) => item.name).join(", ")}` : "."}`,
                          );
                        })
                      }
                    >
                      Ajouter la sélection ({selected.length})
                    </button>
                  </div>
                  <label>
                    Afficher
                    <select
                      value={resultFilter}
                      onChange={(event) => setResultFilter(event.target.value)}
                    >
                      <option value="">Tous</option>
                      {Object.entries(RESULT_STATES).map(([key, label]) => (
                        <option key={key} value={key}>
                          {key === "new" ? "Nouveaux uniquement" : label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={s.table}>
                    <table>
                      <thead>
                        <tr>
                          <th>Sélection</th>
                          <th>Entreprise / activité</th>
                          <th>Ville / adresse</th>
                          <th>Coordonnées</th>
                          <th>Vérification</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map(
                          (result, index) =>
                            (!resultFilter ||
                              resultState(result) === resultFilter) && (
                              <tr key={result.google_place_id || index}>
                                <td>
                                  <input
                                    aria-label={`Sélectionner ${result.name}`}
                                    type="checkbox"
                                    disabled={busy || Boolean(result.duplicate)}
                                    checked={
                                      !result.duplicate && selection.has(index)
                                    }
                                    onChange={(event) =>
                                      setSelection((previous) => {
                                        const next = new Set(previous);
                                        if (event.target.checked)
                                          next.add(index);
                                        else next.delete(index);
                                        return next;
                                      })
                                    }
                                  />
                                </td>
                                <td>
                                  {result.name}
                                  <p className={s.muted}>{result.category}</p>
                                  {googleRatingLabel(result) && (
                                    <p>{googleRatingLabel(result)}</p>
                                  )}
                                </td>
                                <td>
                                  {result.city}
                                  <p className={s.muted}>{result.address}</p>
                                </td>
                                <td>
                                  {result.phone || "—"}
                                  {result.website && (
                                    <p>
                                      <a
                                        href={result.website}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        Ouvrir le site ↗
                                      </a>
                                    </p>
                                  )}
                                </td>
                                <td>
                                  {RESULT_STATES[resultState(result)]}
                                  {!result.duplicate &&
                                    result.google_place_id && (
                                      <p>
                                        <button
                                          disabled={busy}
                                          onClick={() =>
                                            void run(async () => {
                                              await prospectRequest("POST", {
                                                action: "ignore",
                                                fields: result,
                                              });
                                              await refreshResults();
                                              setNotice(
                                                "Établissement ignoré. Vous pouvez le réactiver depuis Ignorés.",
                                              );
                                            })
                                          }
                                        >
                                          Ignorer
                                        </button>
                                      </p>
                                    )}
                                  {result.duplicate?.kind === "ignored" && (
                                    <p>
                                      <button
                                        disabled={busy}
                                        onClick={() =>
                                          void run(() =>
                                            reactivate(result.google_place_id),
                                          )
                                        }
                                      >
                                        Réactiver
                                      </button>
                                    </p>
                                  )}
                                </td>
                              </tr>
                            ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}
          {companyPanel === "ignored" && (
            <IgnoredPlaces
              places={ignored}
              busy={busy}
              onBack={() => setCompanyPanel("list")}
              onReload={() => void run(reload)}
              onReactivate={(id) => void run(() => reactivate(id))}
            />
          )}
          {companyPanel === "list" && (
            <section className={s.panel}>
              <div className={s.toolbar}>
                <div>
                  <h2>Mes prospects</h2>
                  <p className={s.muted}>
                    {prospects.length} prospect(s) enregistré(s)
                  </p>
                </div>
                <button disabled={busy} onClick={() => void run(reload)}>
                  Actualiser
                </button>
              </div>
              <ProspectFilters
                filters={filters}
                update={updateFilters}
                prospects={prospects}
                showStatus
              />
              <div className={s.toolbar}>
                <p className={s.muted}>{filtered.length} résultat(s)</p>
                <button onClick={() => setFilters(EMPTY_FILTERS)}>
                  Réinitialiser les filtres
                </button>
              </div>
              <ProspectList
                prospects={filtered}
                selection={emailSelection}
                busy={busy}
                selectable={false}
                showEmailActions={false}
                onSelect={() => {}}
                onRetry={() => {}}
              />
              {!loading && !filtered.length && (
                <p>
                  Aucun prospect à afficher. Ajoutez une entreprise ou adaptez
                  les filtres.
                </p>
              )}
            </section>
          )}
        </>
      )}

      {view === "prospects" && <section className={s.panel}><div className={s.toolbar}><div><h2>Prospects</h2><p className={s.muted}>{prospects.length} prospect(s) enregistré(s)</p></div><button disabled={busy} onClick={() => void run(reload)}>Actualiser</button></div><ProspectFilters filters={filters} update={updateFilters} prospects={prospects} showStatus showEmail /><div className={s.toolbar}><p className={s.muted}>{filtered.length} résultat(s)</p><div className={s.actions}><button onClick={() => setFilters(EMPTY_FILTERS)}>Réinitialiser les filtres</button><button disabled={busy || !filtered.length} onClick={() => selectProspects(filtered.map(p => p.id))}>Sélectionner les prospects</button><button className={s.primary} disabled={busy || !emailSelection.size} onClick={() => void run(enrichSelection)}>Rechercher les e-mails</button></div></div><ProspectList prospects={filtered} selection={emailSelection} busy={busy} showEmailActions={false} onSelect={(id, checked) => setEmailSelection(previous => { const next = new Set(previous); checked ? next.add(id) : next.delete(id); return next; })} onRetry={retryEmail} />{progress && <p role="status">{progress}</p>}</section>}
      {view === "emails" && (
        <>
          <section className={s.sectionHeading}>
            <div>
              <h2>Recherche d’emails</h2>
              <p className={s.muted}>
                Trouvez les coordonnées email des prospects avant de les
                contacter.
              </p>
            </div>
            <button onClick={() => setView("campaigns")}>
              Passer aux campagnes
            </button>
          </section>
          <div className={s.cards} aria-label="Résumé de recherche email">
            {(
              [
                ["found", "Avec email", emailCounts.found],
                ["not_found", "Sans email trouvé", emailCounts.notFound],
                ["failed", "Échecs", emailCounts.failed],
                ["not_started", "Jamais recherchés", emailCounts.notStarted],
                ["running", "En cours", emailCounts.running],
              ] as const
            ).map(([state, label, count]) => (
              <button
                key={state}
                type="button"
                className={emailFilters.email === state ? s.pipelineActive : ""}
                aria-pressed={emailFilters.email === state}
                onClick={() => updateEmailFilters({ email: state })}
              >
                <span>{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </div>
          <section className={s.panel}>
            <ProspectFilters
              filters={emailFilters}
              update={updateEmailFilters}
              prospects={prospects}
              showStatus
            />
            <div className={s.toolbar}>
              <p className={s.muted}>
                {emailWork.length} prospect(s) à enrichir
              </p>
              <button
                onClick={() =>
                  setEmailFilters({ ...EMPTY_FILTERS, email: "not_started" })
                }
              >
                Réinitialiser les filtres
              </button>
            </div>
            <div className={s.actions}>
              <button
                disabled={busy || !emailWork.length}
                onClick={() => selectProspects(emailWork.map((p) => p.id))}
              >
                Sélectionner les prospects affichés (50 max.)
              </button>
              <button
                disabled={busy}
                onClick={() => setEmailSelection(new Set())}
              >
                Désélectionner
              </button>
              <button
                className={s.primary}
                disabled={busy || !emailSelection.size}
                onClick={() => void run(enrichSelection)}
              >
                Rechercher les emails ({emailSelection.size})
              </button>
            </div>
            {progress && <p role="status">{progress}</p>}
            <ProspectList
              prospects={emailWork}
              selection={emailSelection}
              busy={busy}
              showEmailActions={false}
              onSelect={(id, checked) =>
                setEmailSelection((previous) => {
                  const next = new Set(previous);
                  if (checked) next.add(id);
                  else next.delete(id);
                  return next;
                })
              }
              onRetry={retryEmail}
            />
            {!loading && !emailWork.length && (
              <p>Aucun prospect ne correspond aux filtres.</p>
            )}
          </section>
        </>
      )}

      {view === "campaigns" && (
        <>
          <section className={s.sectionHeading}>
            <div>
              <h2>Campagnes & suivi</h2>
              <p className={s.muted}>
                Préparez vos emails, envoyez vos campagnes et suivez vos
                prospects.
              </p>
            </div>
          </section>
          {loading ? (
            <p role="status">Chargement des prospects…</p>
          ) : (
            <div className={s.cards}>
              {Object.entries(STATUSES).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={campaignStatus === key ? s.pipelineActive : ""}
                  aria-pressed={campaignStatus === key}
                  onClick={() =>
                    setCampaignStatus(campaignStatus === key ? "" : key)
                  }
                >
                  <span>{label}</span>
                  <strong>
                    {
                      prospects.filter((p) => commercialCategory(p) === key)
                        .length
                    }
                  </strong>
                </button>
              ))}
            </div>
          )}
          <section className={s.panel}>
            <ProspectFilters
              filters={campaignFilters}
              update={updateCampaignFilters}
              prospects={prospects}
              showEmail
            />
            <div className={s.toolbar}>
              <p className={s.muted}>{campaignProspects.length} prospect(s)</p>
              <button
                onClick={() => {
                  setCampaignFilters({ ...EMPTY_FILTERS, email: "found" });
                  setCampaignStatus("new");
                  setCampaignSelection(new Set());
                }}
              >
                Réinitialiser les filtres
              </button>
            </div>
            {campaignFilters.email === "found" && (
              <>
                <div className={s.actions}>
                  <button
                    disabled={busy || !campaignProspects.length}
                    onClick={() =>
                      setCampaignSelection(
                        new Set(
                          campaignProspects.map((p) => p.id).slice(0, 20),
                        ),
                      )
                    }
                  >
                    Sélectionner 20 prospects
                  </button>
                  <button
                    disabled={busy || !campaignSelection.size}
                    onClick={() => setCampaignSelection(new Set())}
                  >
                    Désélectionner
                  </button>
                  <span className={s.muted}>
                    {campaignSelection.size} prospect(s) sélectionné(s)
                  </span>
                </div>
                <ProspectBulkEmail
                  ids={[...campaignSelection]}
                  emailCount={campaignSelection.size}
                  disabled={busy}
                  campaign={{ kind: campaignKind }}
                />
              </>
            )}
            <ProspectList
              prospects={campaignProspects}
              selection={campaignSelection}
              busy={busy}
              selectable={campaignFilters.email === "found"}
              showEmailActions={false}
              campaignMode
              onSelect={(id, checked) =>
                setCampaignSelection((previous) => {
                  const next = new Set(previous);
                  if (checked) {
                    if (next.size < 50) next.add(id);
                  } else next.delete(id);
                  return next;
                })
              }
              onRetry={() => {}}
            />
            {!loading && !campaignProspects.length && (
              <p>Aucun prospect ne correspond aux filtres.</p>
            )}
          </section>
        </>
      )}
      {view === "actions" && (
        <>
          <section className={s.sectionHeading}>
            <div>
              <h2>Actions du jour</h2>
              <p className={s.muted}>
                Relances échues selon la date prévue, ou à défaut après J+7. Les
                oppositions et statuts terminaux sont exclus.
              </p>
            </div>
          </section>
          <section className={s.panel}>
            <p className={s.muted}>{dueToday.length} relance(s) à traiter</p>
            <TodayActions
              prospects={dueToday}
              busy={busy}
              onCall={(p) =>
                quickUpdate(
                  p,
                  { last_contact_at: new Date().toISOString() },
                  "Appel enregistré.",
                )
              }
              onReply={(p) =>
                quickUpdate(p, { status: "replied" }, "Réponse enregistrée.")
              }
            />
            {!dueToday.length && <p>Aucune relance échue aujourd’hui.</p>}
          </section>
        </>
      )}
      {view === "actions" && (
        <section className={s.cards} aria-label="Indicateurs commerciaux">
          <div>
            <span>Contactés enregistrés</span>
            <strong>{metrics.contacted}</strong>
          </div>
          <div>
            <span>Réponses enregistrées</span>
            <strong>{metrics.replied}</strong>
          </div>
          <div>
            <span>Positives inférées</span>
            <strong>{metrics.positive}</strong>
          </div>
          <div>
            <span>RDV programmés</span>
            <strong>{metrics.meetings}</strong>
          </div>
          <div>
            <span>Partenaires convertis</span>
            <strong>
              {metrics.converted} · {conversionRate}%
            </strong>
          </div>
          <p className={s.muted}>
            Les réponses et rendez-vous sont des statuts saisis manuellement ;
            aucune donnée de boîte email n’est déduite automatiquement.
          </p>
        </section>
      )}
      {view === "campaigns" && (
        <section className={s.panel}>
          <div className={s.filters}>
            <label>
              Type de campagne
              <select
                value={campaignKind}
                onChange={(e) => {
                  const kind = e.target.value as "initial" | "follow_up";
                  setCampaignKind(kind);
                  setCampaignStatus(kind === "follow_up" ? "follow_up" : "new");
                  setCampaignSelection(new Set());
                }}
              >
                <option value="initial">Premier message</option>
                <option value="follow_up">Relance échue</option>
              </select>
            </label>
            <label>
              Score minimal
              <select
                value={campaignScore}
                onChange={(e) => setCampaignScore(Number(e.target.value))}
              >
                {[0, 30, 50, 70].map((value) => (
                  <option key={value} value={value}>
                    {value || "Tous"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Historique
              <select
                value={campaignHistory}
                onChange={(e) =>
                  setCampaignHistory(
                    e.target.value as "all" | "never" | "contacted",
                  )
                }
              >
                <option value="all">Tous</option>
                <option value="never">Jamais contactés</option>
                <option value="contacted">Déjà contactés</option>
              </select>
            </label>
          </div>
          <p className={s.muted}>
            La sélection ci-dessus respecte les exclusions ; lot conseillé : 10
            à 20 prospects.
          </p>
        </section>
      )}
      {busy && <p role="status">Opération en cours…</p>}
    </div>
  );
}
