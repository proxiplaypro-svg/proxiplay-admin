export const STATUSES = { new: "Nouveaux", to_contact: "À contacter", contacted: "Contactés", follow_up: "À relancer", replied: "Répondus", meeting: "RDV", client: "Clients", rejected: "Refusés" } as const;
export type ProspectStatus = keyof typeof STATUSES;
export const SECTORS = ["restaurants", "bars/cafés", "commerces", "beauté", "coiffure", "sport", "loisirs", "automobile", "habitat", "artisans B2C", "services locaux"];
export const TEXT_FIELDS = ["name", "address", "postal_code", "city", "category", "subcategory", "phone", "email", "website", "google_place_id", "google_maps_url", "contact_name", "contact_role", "contact_email", "contact_phone", "source", "source_url", "notes", "assigned_to", "suggested_message", "suggested_angle"] as const;
export type ProspectFields = Record<(typeof TEXT_FIELDS)[number], string> & { google_rating: number | null; google_user_rating_count: number | null; latitude: number | null; longitude: number | null; status: ProspectStatus; last_contact_at: string | null; next_follow_up_at: string | null; fetched_at: string | null; converted_enseigne_id: string | null };
export type Qualification = { summary: string | null; relevance: number | null; reasons: string[]; suggested_angle: string | null; suggested_message: string | null };
export type PublicEmail = { email: string; type: "general" | "direction" | "commercial" | "named_professional" | "other"; source_url: string; discovered_at: string; is_primary: boolean };
export type Proposal = { id: string; revision: number; to: string; subject: string; body: string; status: "draft" | "sending" | "sent" | "failed"; sent_at?: string };
export type EmailLog = { id: string; to: string; subject: string; body: string; status: Proposal["status"]; sent_at: string | null; created_at: string; provider_message_id: string | null; error_code: string | null };
export type Prospect = ProspectFields & { id: string; normalized_name: string; created_at: string; updated_at: string; revision: number; qualification: Qualification | null; qualification_provider: string | null; emails?: PublicEmail[]; email_enrichment_status?: "not_started" | "running" | "found" | "not_found" | "failed"; email_enriched_at?: string | null; email_enrichment_error?: string | null; do_not_contact?: boolean; proposal?: Proposal | null; email_sending_id?: string | null };
export type HistoryEvent = { id: string; action: string; actor: string; at: string; detail: string };
export type Duplicate = { kind: "prospect" | "client" | "ignored"; id: string; name: string; reason: string };
export type SearchResult = ProspectFields & { duplicate: Duplicate | null };
export const RESULT_STATES = { new: "Nouveau", prospect: "Déjà prospect", client: "Déjà client Proxiplay", ignored: "Ignoré" } as const;
export type IgnoredPlace = ProspectFields & { ignored_at: string; ignored_by: string };
export function resultState(result: SearchResult): keyof typeof RESULT_STATES { return result.duplicate?.kind ?? "new"; }
export function importableIndices(results: SearchResult[]): number[] { return results.flatMap((result, index) => resultState(result) === "new" ? [index] : []); }
export function googleRatingLabel(data: Partial<ProspectFields>): string {
  return [data.google_rating != null ? "★ " + data.google_rating.toLocaleString("fr-FR") : "", data.google_user_rating_count != null ? data.google_user_rating_count.toLocaleString("fr-FR") + " avis" : ""].filter(Boolean).join(" · ");
}
export type SearchInput = { location: string; radius: number; categories: string[]; limit: number };
export class ProspectError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProspectError("Objet attendu.");
  return value as Record<string, unknown>;
}
export function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export function text(value: unknown, max = 500): string {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > max) throw new ProspectError("Texte invalide ou trop long.");
  return value.trim();
}
export function safeUrl(value: string) {
  if (!value) return "";
  try { const url = new URL(value); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error(); return url.href; }
  catch { throw new ProspectError("Le lien doit être une URL http(s) valide."); }
}
export function parseFields(input: unknown): ProspectFields {
  const body = record(input);
  const data = Object.fromEntries(TEXT_FIELDS.map(key => [key, text(body[key], ["notes", "suggested_message", "suggested_angle"].includes(key) ? 10000 : 500)])) as Record<(typeof TEXT_FIELDS)[number], string>;
  if (!data.name) throw new ProspectError("Le nom de l’entreprise est obligatoire.");
  for (const key of ["website", "google_maps_url", "source_url"] as const) data[key] = safeUrl(data[key]);
  for (const key of ["email", "contact_email"] as const) { data[key] = data[key].toLowerCase(); if (data[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data[key])) throw new ProspectError("Email invalide."); }
  const status = body.status ?? "new";
  if (typeof status !== "string" || !Object.hasOwn(STATUSES, status)) throw new ProspectError("Statut invalide.");
  const dates = Object.fromEntries(["last_contact_at", "next_follow_up_at", "fetched_at"].map(key => {
    const value = body[key]; if (value == null || value === "") return [key, null];
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new ProspectError("Date invalide.");
    return [key, new Date(value).toISOString()];
  })) as Pick<ProspectFields, "last_contact_at" | "next_follow_up_at" | "fetched_at">;
  const coordinate = (key: string, max: number) => { const value = body[key]; if (value == null || value === "") return null; if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > max) throw new ProspectError("Coordonnées invalides."); return value; };
  const metric = (key: string, max: number, integer = false) => { const value = body[key]; if (value == null) return null; if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) throw new ProspectError("Donnée Google invalide."); return value; };
  const converted = text(body.converted_enseigne_id) || null;
  if (converted && !/^[\w-]+$/.test(converted)) throw new ProspectError("Identifiant enseigne invalide.");
  return { ...data, google_rating: metric("google_rating", 5), google_user_rating_count: metric("google_user_rating_count", Number.MAX_SAFE_INTEGER, true), source: data.source || "manual", status: status as ProspectStatus, ...dates, latitude: coordinate("latitude", 90), longitude: coordinate("longitude", 180), converted_enseigne_id: converted };
}
export function identityKeys(data: Record<string, unknown>): string[] {
  const read = (...keys: string[]) => keys.map(key => data[key]).find(value => typeof value === "string" && value.trim()) as string | undefined;
  const keys: string[] = [];
  const place = read("google_place_id", "googlePlaceId"); if (place) keys.push(`place:${place.trim()}`);
  const name = normalize(read("name", "title", "merchantName") || "");
  const address = normalize(read("address") || "");
  if (name && address) keys.push(`address:${name}:${address}`);
  for (const key of ["phone", "phone_number", "contact_phone"]) {
    let phone = (read(key) || "").replace(/\D/g, ""); if (phone.startsWith("0033")) phone = phone.slice(2); if (/^0\d{9}$/.test(phone)) phone = `33${phone.slice(1)}`;
    if (phone.length >= 8) keys.push(`phone:${phone}`);
  }
  for (const key of ["email", "contact_email"]) { const email = read(key); if (email) keys.push(`email:${email.trim().toLowerCase()}`); }
  const website = read("website", "site_web_url");
  if (website) { try { keys.push(`domain:${new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.toLowerCase().replace(/^www\./, "")}`); } catch { /* Invalid legacy URLs have no identity key. */ } }
  return [...new Set(keys)];
}
export function duplicateOf(candidate: Record<string, unknown>, entries: { id: string; kind: Duplicate["kind"]; data: Record<string, unknown> }[]): Duplicate | null {
  const keys = new Set(identityKeys(candidate));
  for (const entry of [...entries].sort((a, b) => ({ client: 0, prospect: 1, ignored: 2 }[a.kind] - { client: 0, prospect: 1, ignored: 2 }[b.kind]))) {
    const match = identityKeys(entry.data).find(key => keys.has(key) && (entry.kind !== "ignored" || key.startsWith("place:")));
    if (match) return { id: entry.id, kind: entry.kind, name: String(entry.data.name || entry.data.title || "Entreprise"), reason: match.split(":")[0] };
  }
  return null;
}
export function parseSearch(input: unknown): SearchInput {
  const body = record(input); const location = text(body.location);
  if (!location || typeof body.radius !== "number" || body.radius < 1 || body.radius > 50 || !Number.isFinite(body.radius) || ![20, 50].includes(Number(body.limit)) || typeof body.limit !== "number") throw new ProspectError("Localisation, rayon (1–50 km) et limite (20 ou 50) requis.");
  if (!Array.isArray(body.categories) || !body.categories.length || body.categories.length > 11) throw new ProspectError("Sélectionnez de 1 à 11 secteurs.");
  const categories = [...new Set(body.categories.map(value => text(value, 100)))];
  if (categories.some(value => !value)) throw new ProspectError("Secteur vide.");
  return { location, radius: body.radius, limit: Number(body.limit), categories };
}

export function enrichMissing(current: Partial<ProspectFields>, details: ProspectFields): Partial<ProspectFields> {
  const next = { ...current };
  for (const key of ["address", "postal_code", "city", "category", "subcategory", "phone", "website", "google_place_id", "google_maps_url"] as const) {
    if (!next[key] && details[key]) next[key] = details[key];
  }
  if (next.latitude == null) next.latitude = details.latitude;
  if (next.longitude == null) next.longitude = details.longitude;
  if (next.google_rating == null) next.google_rating = details.google_rating;
  if (next.google_user_rating_count == null) next.google_user_rating_count = details.google_user_rating_count;
  next.source_url = details.source_url;
  next.fetched_at = details.fetched_at;
  return next;
}
