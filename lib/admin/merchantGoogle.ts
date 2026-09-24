import type { ProspectFields } from "@/lib/prospection/model";
export function googleMerchantPatch(current: Record<string, unknown>, place: ProspectFields) {
  const patch: Record<string, string> = { google_place_id: place.google_place_id };
  const incoming = { address: place.address, area_code: place.postal_code, city: place.city, phone: place.phone, site_web_url: place.website };
  const preserved: string[] = [];
  for (const [key, value] of Object.entries(incoming)) {
    if (!value) continue;
    if (typeof current[key] === "string" && current[key].trim()) {
      if (current[key] !== value) preserved.push(key);
    } else patch[key] = value;
  }
  return { patch, preserved };
}
