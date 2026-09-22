import { identityKeys, parseSearch, parseFields, ProspectError, type ProspectFields, type SearchInput } from "./model";
import { businessCallBudget, isArtisanSearch, queriesForSector } from "./searchConfig";

export type SearchMetrics = { queriesAttempted: number; googleCalls: number; rawResults: number; uniqueBusinesses: number; excludedKnown: number; outOfRadius: number; duplicates: number; returned: number; callBudget: number; budgetReached: boolean };
export interface ProspectProvider { search(input: SearchInput, accept?: (candidate: ProspectFields) => boolean, report?: (metrics: SearchMetrics) => void): Promise<ProspectFields[]>; getDetails(id: string): Promise<ProspectFields> }
type Place = { rating?: number; userRatingCount?: number; id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; addressComponents?: { longText: string; types: string[] }[]; nationalPhoneNumber?: string; websiteUri?: string; googleMapsUri?: string; primaryTypeDisplayName?: { text?: string } };
export const DETAIL_FIELDS = "id,displayName,formattedAddress,location,addressComponents,nationalPhoneNumber,websiteUri,googleMapsUri,primaryTypeDisplayName,rating,userRatingCount";
export const SEARCH_FIELDS = DETAIL_FIELDS.split(",").map(field => "places." + field).join(",") + ",nextPageToken";
export function searchCallBudget(limit: number, categories: string[] = []) { return businessCallBudget(limit, categories); }
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (n: number) => n * Math.PI / 180;
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export class GooglePlacesProvider implements ProspectProvider {
  constructor(private key: string, private fetcher: typeof fetch = fetch) {}
  private async request(path: string, mask: string, body?: unknown) {
    if (!this.key) throw new ProspectError("Recherche indisponible : configurer GOOGLE_PLACES_API_KEY côté serveur. L’ajout manuel reste disponible.", 503);
    let response: Response;
    try { response = await this.fetcher(`https://places.googleapis.com/v1/${path}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.key, "X-Goog-FieldMask": mask }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(15000) }); }
    catch { throw new ProspectError("Le service de recherche ne répond pas. Réessayez.", 502); }
    if (!response.ok) throw new ProspectError("Google Places est indisponible. Vérifiez la configuration et les quotas côté serveur.", 502);
    return response.json();
  }
  private convert(place: Place, category?: string): ProspectFields {
    if (!place.id || !place.displayName?.text) throw new ProspectError("Résultat Google Places incomplet.", 502);
    const component = (type: string) => place.addressComponents?.find(value => value.types.includes(type))?.longText || "";
    return parseFields({ google_rating: place.rating, google_user_rating_count: place.userRatingCount, name: place.displayName.text, address: place.formattedAddress, city: component("locality") || component("postal_town"), postal_code: component("postal_code"), category: place.primaryTypeDisplayName?.text || category, subcategory: category, phone: place.nationalPhoneNumber, website: place.websiteUri, google_place_id: place.id, google_maps_url: place.googleMapsUri, source: "google_places", source_url: place.googleMapsUri, fetched_at: new Date().toISOString(), latitude: place.location?.latitude, longitude: place.location?.longitude });
  }
  async search(rawInput: SearchInput, accept: (candidate: ProspectFields) => boolean = () => true, report?: (metrics: SearchMetrics) => void) {
    const input = parseSearch(rawInput);
    const artisan = isArtisanSearch(input.categories);
    const budget = searchCallBudget(input.limit, input.categories);
    const metrics: SearchMetrics = { queriesAttempted: 0, googleCalls: 0, rawResults: 0, uniqueBusinesses: 0, excludedKnown: 0, outOfRadius: 0, duplicates: 0, returned: 0, callBudget: budget + 1, budgetReached: false };
    const results: ProspectFields[] = [];
    const seen = new Set<string>();
    // Interleave sectors and their trades before consuming any pagination.
    const groups = input.categories.map(queriesForSector);
    const queries = [...new Set(Array.from({ length: Math.max(...groups.map(g => g.length)) }, (_, i) => groups.flatMap(g => g[i] ? [g[i]] : [])).flat())];
    const queue = queries.map(query => ({ query, token: undefined as string | undefined, tokens: new Set<string>(), pages: 0 }));
    let calls = 0;
    try {
      metrics.googleCalls++;
      const location = await this.request("places:searchText", "places.location", { textQuery: input.location, pageSize: 1, languageCode: "fr" });
      const center = location.places?.[0]?.location;
      if (!center || !Number.isFinite(center.latitude) || !Number.isFinite(center.longitude)) throw new ProspectError("Localisation introuvable.");
      while (queue.length && calls < budget && results.length < input.limit) {
        const task = queue.shift()!;
        if (!task.pages) metrics.queriesAttempted++;
        calls++; metrics.googleCalls++; task.pages++;
        const body = { textQuery: task.query, pageSize: artisan ? (input.limit === 20 ? 5 : 10) : 20, languageCode: "fr", locationBias: { circle: { center, radius: input.radius * 1000 } }, ...(task.token ? { pageToken: task.token } : {}) };
        const response = await this.request("places:searchText", SEARCH_FIELDS, body);
        metrics.rawResults += response.places?.length || 0;
        for (const place of (response.places || []) as Place[]) {
          if (!place.id || !place.displayName?.text || !place.location || !Number.isFinite(place.location.latitude) || !Number.isFinite(place.location.longitude)) continue;
          if (distanceKm(center, place.location) > input.radius) { metrics.outOfRadius++; continue; }
          const candidate = this.convert(place, task.query);
          const keys = identityKeys(candidate).filter(k => !k.startsWith("email:")).sort((a, b) => {
            const rank = (k: string) => ["place", "phone", "domain", "address"].indexOf(k.split(":")[0]);
            return rank(a) - rank(b);
          });
          const duplicate = keys.some(key => seen.has(key));
          keys.forEach(key => seen.add(key)); // Remember aliases even on a repeated result.
          if (duplicate) { metrics.duplicates++; continue; }
          metrics.uniqueBusinesses++;
          if (accept(candidate)) results.push(candidate); else metrics.excludedKnown++;
          if (results.length >= input.limit) break;
        }
        const next = response.nextPageToken;
        if (typeof next === "string" && next && !task.tokens.has(next) && task.pages < 3) {
          task.tokens.add(next); task.token = next;
          // Preserve native pagination for established single-sector searches.
          if (artisan) queue.push(task); else queue.unshift(task);
        }
      }
      metrics.returned = results.length;
      metrics.budgetReached = calls >= budget && results.length < input.limit && queue.length > 0;
      return results;
    } finally {
      report?.(metrics);
      console.info("[PROSPECTION_SEARCH]", metrics); // Counts only: no key, contact data or raw Google payload.
    }
  }
  async getDetails(id: string) {
    if (!/^[\w-]{1,300}$/.test(id)) throw new ProspectError("Identifiant de lieu invalide.");
    return this.convert(await this.request(`places/${encodeURIComponent(id)}`, DETAIL_FIELDS));
  }
}
export function getProspectProvider(): ProspectProvider { return new GooglePlacesProvider(process.env.GOOGLE_PLACES_API_KEY || ""); }
