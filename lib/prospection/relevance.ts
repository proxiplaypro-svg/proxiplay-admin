import { normalize, type Prospect, type ProspectFields } from "./model";
import { prospectRecipient } from "./emailRecipient";

export const PROXIPLAY_PRIORITY_CATEGORIES = ["commerces de proximité", "restauration", "beauté", "loisirs", "équipement de la maison", "services aux particuliers"] as const;
const sectorTerms: Record<(typeof PROXIPLAY_PRIORITY_CATEGORIES)[number], string[]> = {
  "commerces de proximité": ["commerce", "boutique", "magasin", "fleur", "boulanger", "opticien"], restauration: ["restaurant", "bar", "cafe", "brasserie", "pizzeria"], beauté: ["beaute", "coiff", "spa", "institut"], loisirs: ["loisir", "sport", "bowling", "escape"], "équipement de la maison": ["habitat", "maison", "amenagement", "meuble"], "services aux particuliers": ["artisan", "plomb", "electric", "pressing", "cordonnier", "toilettage"],
};
export type ContactChannels = { email: boolean; phone: boolean; website: boolean; form: boolean };
export function contactChannels(p: Pick<Prospect, "email" | "contact_email" | "emails" | "phone" | "contact_phone" | "website"> & Partial<Pick<ProspectFields, "source_url">>): ContactChannels {
  return { email: Boolean(prospectRecipient(p)), phone: Boolean(p.contact_phone || p.phone), website: Boolean(p.website), form: false };
}
export function relevance(p: Pick<Prospect, "category" | "subcategory" | "address" | "city" | "latitude" | "longitude" | "email" | "contact_email" | "emails" | "phone" | "contact_phone" | "website">) {
  const reasons: string[] = []; let score = 0; const category = normalize(`${p.category} ${p.subcategory}`);
  const matched = PROXIPLAY_PRIORITY_CATEGORIES.find(group => sectorTerms[group].some(term => category.includes(normalize(term))));
  if (matched) { score += 35; reasons.push(`Secteur prioritaire : ${matched}`); }
  if (p.address || p.city) { score += 20; reasons.push("Établissement local renseigné"); }
  if (p.latitude != null && p.longitude != null) { score += 10; reasons.push("Position géographique renseignée"); }
  const channels = contactChannels(p); const count = Object.values(channels).filter(Boolean).length;
  if (count) { score += Math.min(20, count * 10); reasons.push(`${count} canal${count > 1 ? "aux" : ""} de contact disponible${count > 1 ? "s" : ""}`); }
  if (matched) { score += 15; reasons.push("Activité compatible avec un lot à confirmer"); }
  return { score, reasons, category: matched || null, channels };
}
