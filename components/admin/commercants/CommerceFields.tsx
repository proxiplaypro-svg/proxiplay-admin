"use client";
export const emptyCommerce = { name: "", category: "", address: "", area_code: "", city: "", phone: "", site_web_url: "", google_place_id: "", description: "", imageUrl: "" };
export type CommerceForm = typeof emptyCommerce;
export default function CommerceFields({ value, onChange, disabled = false }: { value: CommerceForm; onChange: (key: keyof CommerceForm, value: string) => void; disabled?: boolean }) {
  return <div className="game-edit-grid">
    {([ ["name", "Nom du commerce", "text"], ["category", "Catégories (séparées par des virgules)", "text"], ["address", "Adresse", "text"], ["area_code", "Code postal", "text"], ["city", "Ville", "text"], ["phone", "Téléphone du commerce", "tel"], ["site_web_url", "Site web", "url"], ["google_place_id", "Identifiant Google du lieu", "text"], ["imageUrl", "Lien de la photo du commerce", "url"] ] as const).map(([key, label, type]) => <label className="game-edit-field" key={key}><span className="search-label">{label}</span><input className="search-input" type={type} required={key === "name"} maxLength={500} value={value[key]} disabled={disabled} onChange={e => onChange(key, e.target.value)} /></label>)}
    <label className="game-edit-field"><span className="search-label">Description courte</span><textarea className="search-input" rows={3} maxLength={2000} value={value.description} disabled={disabled} onChange={e => onChange("description", e.target.value)} /></label>
  </div>;
}
