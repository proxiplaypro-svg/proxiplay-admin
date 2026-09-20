"use client";
import { googleRatingLabel, type ProspectFields as Fields } from "@/lib/prospection/model";
import s from "@/app/admin/prospection/prospection.module.css";
const company = [["name", "Entreprise *"], ["category", "Secteur"], ["subcategory", "Sous-catégorie"], ["address", "Adresse"], ["postal_code", "Code postal"], ["city", "Ville"], ["phone", "Téléphone"], ["email", "Email"], ["website", "Site (https://…)"], ["google_place_id", "Google Place ID"], ["google_maps_url", "Lien Google Maps"]] as const;
const contact = [["contact_name", "Nom du contact"], ["contact_role", "Fonction"], ["contact_email", "Email du contact"], ["contact_phone", "Téléphone du contact"]] as const;
export function ProspectFields({ value, onChange }: { value: Partial<Fields>; onChange: (value: Partial<Fields>) => void }) {
  const field = ([key, label]: readonly [keyof Fields, string]) => <label key={key}>{label}<input required={key === "name"} type={key.includes("email") ? "email" : key.includes("phone") ? "tel" : ["website", "google_maps_url"].includes(key) ? "url" : "text"} maxLength={500} value={String(value[key] ?? "")} onChange={event => onChange({ ...value, [key]: event.target.value })} /></label>;
  return <><section className={s.panel}><h2>Entreprise</h2>{googleRatingLabel(value) && <p>{googleRatingLabel(value)} · Google Maps</p>}<div className={s.grid}>{company.map(field)}</div></section><section className={s.panel}><h2>Contact</h2><div className={s.grid}>{contact.map(field)}</div></section></>;
}
