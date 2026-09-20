import { parseSearch, parseFields, ProspectError, type ProspectFields, type SearchInput } from "./model";

export interface ProspectProvider { search(input: SearchInput): Promise<ProspectFields[]>; getDetails(id: string): Promise<ProspectFields> }
type Place = { rating?: number; userRatingCount?: number; id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; addressComponents?: { longText: string; types: string[] }[]; nationalPhoneNumber?: string; websiteUri?: string; googleMapsUri?: string; primaryTypeDisplayName?: { text?: string } };
export const DETAIL_FIELDS = "id,displayName,formattedAddress,location,addressComponents,nationalPhoneNumber,websiteUri,googleMapsUri,primaryTypeDisplayName,rating,userRatingCount";
export const SEARCH_FIELDS = DETAIL_FIELDS.split(",").filter(field => field !== "primaryTypeDisplayName").map(field => "places." + field).join(",") + ",nextPageToken";
export function searchCallBudget(limit: number) { return limit === 20 ? 1 : limit === 50 ? 4 : 8; }
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
    return parseFields({ google_rating: place.rating, google_user_rating_count: place.userRatingCount, name: place.displayName.text, address: place.formattedAddress, city: component("locality") || component("postal_town"), postal_code: component("postal_code"), category: category || place.primaryTypeDisplayName?.text, phone: place.nationalPhoneNumber, website: place.websiteUri, google_place_id: place.id, google_maps_url: place.googleMapsUri, source: "google_places", source_url: place.googleMapsUri, fetched_at: new Date().toISOString(), latitude: place.location?.latitude, longitude: place.location?.longitude });
  }
  async search(rawInput: SearchInput) {
    const input = parseSearch(rawInput);
    const location = await this.request("places:searchText", "places.location", { textQuery: input.location, pageSize: 1, languageCode: "fr" });
    const center = location.places?.[0]?.location;
    if (!center || !Number.isFinite(center.latitude) || !Number.isFinite(center.longitude)) throw new ProspectError("Localisation introuvable.");
    const results = new Map<string, ProspectFields>();
    const budget = searchCallBudget(input.limit);
    let calls = 0;
    // Native pagination first, then four geographic biases for 100 results.
    // Every result is filtered against the ORIGINAL circle, never the bias.
    const centers = [center];
    if (input.limit === 100) {
      for (const bearing of [45, 135, 225, 315]) {
        const angular = input.radius * 0.55 / 6371;
        const lat = center.latitude * Math.PI / 180, lon = center.longitude * Math.PI / 180, direction = bearing * Math.PI / 180;
        const nextLat = Math.asin(Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(direction));
        const nextLon = lon + Math.atan2(Math.sin(direction) * Math.sin(angular) * Math.cos(lat), Math.cos(angular) - Math.sin(lat) * Math.sin(nextLat));
        centers.push({ latitude: nextLat * 180 / Math.PI, longitude: ((nextLon * 180 / Math.PI + 540) % 360) - 180 });
      }
    }
    for (const [area, queryCenter] of centers.entries()) {
      for (const category of input.categories) {
        const body = { textQuery: category, pageSize: 20, languageCode: "fr", locationBias: { circle: { center: queryCenter, radius: input.radius * 1000 * (area ? 0.55 : 1) } } };
        let pageToken: string | undefined;
        const tokens = new Set<string>();
        for (let page = 0; page < 3; page++) {
          if (calls >= budget || results.size >= input.limit) return [...results.values()];
          calls++;
          const response = await this.request("places:searchText", SEARCH_FIELDS, { ...body, ...(pageToken ? { pageToken } : {}) });
          for (const place of (response.places || []) as Place[]) {
            if (place.id && place.displayName?.text && place.location && distanceKm(center, place.location) <= input.radius && !results.has(place.id)) results.set(place.id, this.convert(place, category));
            if (results.size >= input.limit) return [...results.values()];
          }
          const next = response.nextPageToken;
          if (typeof next !== "string" || !next || tokens.has(next)) break;
          tokens.add(next); pageToken = next;
        }
      }
    }
    return [...results.values()];
  }
  async getDetails(id: string) {
    if (!/^[\w-]{1,300}$/.test(id)) throw new ProspectError("Identifiant de lieu invalide.");
    return this.convert(await this.request(`places/${encodeURIComponent(id)}`, DETAIL_FIELDS));
  }
}
export function getProspectProvider(): ProspectProvider { return new GooglePlacesProvider(process.env.GOOGLE_PLACES_API_KEY || ""); }
