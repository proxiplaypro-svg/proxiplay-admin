import { normalize, type Prospect } from "./model";

export const EMAIL_FILTERS = { found: "Email trouvé", not_found: "Sans email", failed: "Échec", not_started: "Non recherché" } as const;
export type EmailState = keyof typeof EMAIL_FILTERS | "running";
export type ProspectFilters = { status: string; email: string; category: string; city: string; source: string; date: string; query: string };
export const EMPTY_FILTERS: ProspectFilters = { status: "", email: "", category: "", city: "", source: "", date: "", query: "" };

export function prospectEmailSummary(p: Prospect) {
  const emails = [...new Map((p.emails || []).filter(item => item.email.trim()).map(item => [item.email.toLowerCase(), item])).values()];
  const primary = emails.find(item => item.is_primary) || emails[0];
  const email = primary?.email || p.contact_email || p.email || "";
  const state: EmailState = email ? "found" : p.email_enrichment_status === "failed" ? "failed" : p.email_enrichment_status === "not_found" ? "not_found" : p.email_enrichment_status === "running" ? "running" : "not_started";
  const label = state === "found" ? (primary ? "Email trouvé" : "Email renseigné") : state === "not_found" ? "Aucun email public trouvé" : state === "failed" ? "Recherche email échouée" : state === "running" ? "Recherche email en cours…" : "Email non recherché";
  return { email, state, label, additional: Math.max(0, emails.length - 1) };
}

export function matchesProspectFilters(p: Prospect, filters: ProspectFilters) {
  return (!filters.status || p.status === filters.status)
    && (!filters.email || prospectEmailSummary(p).state === filters.email)
    && (!filters.category || p.category === filters.category)
    && (!filters.city || normalize(p.city).includes(normalize(filters.city)))
    && (!filters.source || p.source === filters.source)
    && (!filters.date || p.created_at.slice(0, 10) === filters.date)
    && (!filters.query || normalize([p.name, p.address, p.city, p.email, p.contact_email, ...(p.emails || []).map(item => item.email), p.contact_name, p.phone].join(" ")).includes(normalize(filters.query)));
}

export const PROSPECTS_CHANGED = "proxiplay:prospects-changed";
export function notifyProspectsChanged() {
  window.dispatchEvent(new Event(PROSPECTS_CHANGED));
  // A timestamp only, never contact data. Other open list tabs refresh from the API.
  try { localStorage.setItem(PROSPECTS_CHANGED, String(Date.now())); } catch { /* Storage can be disabled; focus refresh still works. */ }
}
