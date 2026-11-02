import { normalize, type Prospect, type ProspectStatus } from "./model";
import { prospectRecipient } from "./emailRecipient";

export const EMAIL_FILTERS = { found: "Email trouvé", not_found: "Sans email", failed: "Échec", not_started: "Non recherché" } as const;
export type EmailState = keyof typeof EMAIL_FILTERS | "running";
export type ProspectFilters = { status: string; email: string; priority: string; category: string; city: string; source: string; date: string; query: string };
export const EMPTY_FILTERS: ProspectFilters = { status: "", email: "", priority: "", category: "", city: "", source: "", date: "", query: "" };

export type CommercialCategory = ProspectStatus;
export const FOLLOW_UP_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

/** One exclusive pipeline category. Missing/invalid dates remain Contactés. */
export function commercialCategory(p: Pick<Prospect, "status" | "last_contact_at"> & Partial<Pick<Prospect, "next_follow_up_at">>, at: Date | number = Date.now()): CommercialCategory {
  if (!['contacted', 'follow_up'].includes(p.status)) return p.status;
  const now = at instanceof Date ? at.getTime() : at;
  const scheduled = p.next_follow_up_at ? Date.parse(p.next_follow_up_at) : Number.NaN;
  // An explicit next action is the source of truth; the historical J+7 rule is fallback only.
  if (Number.isFinite(scheduled)) return scheduled <= now ? "follow_up" : "contacted";
  if (p.status === "follow_up") return "follow_up";
  const lastContact = p.last_contact_at ? Date.parse(p.last_contact_at) : Number.NaN;
  return Number.isFinite(lastContact) && now - lastContact >= FOLLOW_UP_DELAY_MS ? "follow_up" : "contacted";
}

export function daysSinceLastContact(lastContactAt: string | null, at: Date | number = Date.now()) {
  const lastContact = lastContactAt ? Date.parse(lastContactAt) : Number.NaN;
  const now = at instanceof Date ? at.getTime() : at;
  return Number.isFinite(lastContact) ? Math.max(0, Math.floor((now - lastContact) / 86400000)) : null;
}

export function commercialEmailAction(p: Pick<Prospect, "status" | "last_contact_at"> & Partial<Pick<Prospect, "next_follow_up_at" | "do_not_contact">>, hasEmail: boolean, at: Date | number = Date.now()) {
  if (p.do_not_contact) return null;
  if (!hasEmail) return null;
  const category = commercialCategory(p, at);
  return category === "new" || category === "to_contact" ? "initial" : category === "follow_up" ? "follow_up" : null;
}

export function isFollowUpDue(p: Pick<Prospect, "status" | "last_contact_at"> & Partial<Pick<Prospect, "next_follow_up_at" | "do_not_contact">>, at: Date | number = Date.now()) {
  return !p.do_not_contact && commercialCategory(p, at) === "follow_up";
}

export const EMAIL_ERROR_EXPLANATIONS: Record<string, string> = {
  SITE_INACCESSIBLE: "Le site a refusé la consultation, n’est pas une page HTML exploitable ou n’est pas joignable.",
  TIMEOUT: "Le site n’a pas répondu dans le délai de sécurité de 6 secondes.",
  PAGE_TOO_LARGE: "La page dépasse la limite de 512 Kio fixée pour la recherche.",
  UNSAFE_DESTINATION: "L’URL ou une redirection a été bloquée par les protections de sécurité (SSRF).",
  SEARCH_FAILED: "La recherche a échoué avant d’obtenir un résultat exploitable. Réessayez plus tard.",
  BUSY: "La capacité de recherche est momentanément occupée. Réessayez dans un instant.",
  RESULT_DISCARDED: "La fiche a changé pendant la recherche ; le résultat a été écarté par sécurité.",
};

export function emailErrorExplanation(code: string | null | undefined) {
  return code ? EMAIL_ERROR_EXPLANATIONS[code] || "Erreur de recherche non détaillée. Réessayez après vérification de la fiche." : "Erreur de recherche non détaillée. Réessayez après vérification de la fiche.";
}

export function prospectEmailSummary(p: Prospect) {
  const emails = [...new Map((p.emails || []).filter(item => item.email.trim()).map(item => [item.email.toLowerCase(), item])).values()];
  const primary = emails.find(item => item.is_primary) || emails[0];
  const email = prospectRecipient(p);
  const state: EmailState = email ? "found" : p.email_enrichment_status === "failed" ? "failed" : p.email_enrichment_status === "not_found" ? "not_found" : p.email_enrichment_status === "running" ? "running" : "not_started";
  const label = state === "found" ? (primary ? "Email trouvé" : "Email renseigné") : state === "not_found" ? "Aucun email public trouvé" : state === "failed" ? "Recherche email échouée" : state === "running" ? "Recherche email en cours…" : "Email non recherché";
  return { email, state, label, additional: Math.max(0, emails.length - 1) };
}

export function matchesProspectFilters(p: Prospect, filters: ProspectFilters) {
  return (!filters.status || p.status === filters.status)
    && (!filters.email || prospectEmailSummary(p).state === filters.email)
    && (!filters.priority || (p.commercial_priority || "medium") === filters.priority)
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
