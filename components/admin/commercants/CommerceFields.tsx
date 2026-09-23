"use client";
import MerchantCategorySelect from "./MerchantCategorySelect";
export const emptyCommerce = { name: "", category: [] as string[], address: "", area_code: "", city: "", phone: "", site_web_url: "", google_place_id: "", description: "", imageUrl: "" };
export type CommerceForm = typeof emptyCommerce;
export default function CommerceFields({ value, onChange, disabled = false }: { value: CommerceForm; onChange: <K extends keyof CommerceForm>(key: K, value: CommerceForm[K]) => void; disabled?: boolean }) {
  return <div className="game-edit-grid">
    <label className="game-edit-field"><span className="search-label">Nom du commerce</span><input className="search-input" required maxLength={500} value={value.name} disabled={disabled} onChange={e => onChange("name", e.target.value)} /></label>
    <MerchantCategorySelect value={value.category} onChange={categories => onChange("category", categories)} disabled={disabled} />
    {([ ["address", "Adresse", "text"], ["area_code", "Code postal", "text"], ["city", "Ville", "text"], ["phone", "Téléphone du commerce", "tel"], ["site_web_url", "Site web", "url"], ["google_place_id", "Identifiant Google du lieu", "text"], ["imageUrl", "Lien de la photo du commerce", "url"] ] as const).map(([key, label, type]) => <label className="game-edit-field" key={key}><span className="search-label">{label}</span><input className="search-input" type={type} maxLength={500} value={value[key]} disabled={disabled} onChange={e => onChange(key, e.target.value)} /></label>)}
    <label className="game-edit-field"><span className="search-label">Description courte</span><textarea className="search-input" rows={3} maxLength={2000} value={value.description} disabled={disabled} onChange={e => onChange("description", e.target.value)} /></label>
  </div>;
}
