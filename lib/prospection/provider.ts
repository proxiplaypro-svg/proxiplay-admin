import { parseFields, ProspectError, type ProspectFields, type SearchInput } from "./model";

export interface ProspectProvider { search(input: SearchInput): Promise<ProspectFields[]>; getDetails(id: string): Promise<ProspectFields> }
type Place = { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; addressComponents?: { longText: string; types: string[] }[]; nationalPhoneNumber?: string; websiteUri?: string; googleMapsUri?: string; primaryTypeDisplayName?: { text?: string } };
const fields = "id,displayName,formattedAddress,location,addressComponents,nationalPhoneNumber,websiteUri,googleMapsUri,primaryTypeDisplayName";
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
    return parseFields({ name: place.displayName.text, address: place.formattedAddress, city: component("locality") || component("postal_town"), postal_code: component("postal_code"), category: category || place.primaryTypeDisplayName?.text, phone: place.nationalPhoneNumber, website: place.websiteUri, google_place_id: place.id, google_maps_url: place.googleMapsUri, source: "google_places", source_url: place.googleMapsUri, fetched_at: new Date().toISOString(), latitude: place.location?.latitude, longitude: place.location?.longitude });
  }
  async search(input: SearchInput) {
    const location = await this.request("places:searchText", "places.location", { textQuery: input.location, pageSize: 1, languageCode: "fr" });
    const center = location.places?.[0]?.location;
    if (!center) throw new ProspectError("Localisation introuvable.");
    const results = new Map<string, ProspectFields>();
    // Bounded to one page per sector, then enforce the actual circle (bias is not a restriction).
    for (const category of input.categories) {
      const response = await this.request("places:searchText", fields.split(",").map(field => `places.${field}`).join(","), { textQuery: category, pageSize: Math.min(20, input.limit), languageCode: "fr", locationBias: { circle: { center, radius: input.radius * 1000 } } });
      for (const place of (response.places || []) as Place[]) {
        if (place.id && place.location && distanceKm(center, place.location) <= input.radius && !results.has(place.id)) results.set(place.id, this.convert(place, category));
      }
      if (results.size >= input.limit) break;
    }
    return [...results.values()].slice(0, input.limit);
  }
  async getDetails(id: string) {
    if (!/^[\w-]{1,300}$/.test(id)) throw new ProspectError("Identifiant de lieu invalide.");
    return this.convert(await this.request(`places/${encodeURIComponent(id)}`, fields));
  }
}
export function getProspectProvider(): ProspectProvider { return new GooglePlacesProvider(process.env.GOOGLE_PLACES_API_KEY || ""); }
