"use client";
import { useState } from "react";
import type { ProspectFields } from "@/lib/prospection/model";
import { googleMerchantPatch } from "@/lib/admin/merchantGoogle";
import { merchantMediaRequest } from "@/lib/admin/merchantMediaClient";
import type { CommerceForm } from "./CommerceFields";

export default function MerchantGoogleSelect({ value, onChange, disabled }: { value: CommerceForm; onChange: <K extends keyof CommerceForm>(key: K, value: CommerceForm[K]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [location, setLocation] = useState("");
  const [results, setResults] = useState<ProspectFields[]>([]);
  const [selected, setSelected] = useState<ProspectFields | null>(null);
  const [busy, setBusy] = useState(false); const [searched, setSearched] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function search(searchName = name, searchLocation = location) {
    setBusy(true); setError(""); setResults([]); setSearched(false);
    try { const data = await merchantMediaRequest("google", { name: searchName, location: searchLocation }); setResults(data.results); setSearched(true); }
    catch (error) { setError(error instanceof Error ? error.message : "La recherche Google a échoué."); }
    finally { setBusy(false); }
  }
  function start() {
    setName(value.name); setLocation(value.city || value.address); setOpen(true);
    if (value.name.trim() && (value.city || value.address).trim()) void search(value.name, value.city || value.address);
  }
  return <fieldset className="game-edit-field" disabled={disabled || busy} onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); if (!busy && name.trim() && location.trim()) void search(); } }} style={{ border: 0, padding: 0, margin: 0, gridColumn: "1 / -1" }}>
    <legend className="search-label">Identifiant Google du lieu</legend>
    {value.google_place_id && <div><p>✓ Établissement Google associé</p><p>{selected?.google_place_id === value.google_place_id ? `${selected.name} — ${selected.address} ${selected.postal_code} ${selected.city}` : `${value.name} — ${value.address} ${value.area_code} ${value.city}`}</p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected?.name || value.name)}&query_place_id=${encodeURIComponent(value.google_place_id)}`} target="_blank" rel="noreferrer">Voir sur Google Maps</a><p><code>{value.google_place_id}</code></p></div>}
    <div className="dashboard-actions"><button type="button" className="secondary-button" onClick={start}>{value.google_place_id ? "Changer" : "Trouver sur Google"}</button>{value.google_place_id && <button type="button" className="secondary-button" onClick={() => { onChange("google_place_id", ""); setSelected(null); setNotice("Association supprimée. Les coordonnées sont conservées."); }}>Supprimer l’association Google</button>}</div>
    {notice && <p role="status">{notice}</p>}
    {open && <div><div className="game-edit-grid"><label className="game-edit-field">Nom du commerce à rechercher<input className="search-input" value={name} maxLength={200} onChange={e => setName(e.target.value)} /></label><label className="game-edit-field">Ville ou adresse<input className="search-input" value={location} maxLength={300} onChange={e => setLocation(e.target.value)} /></label></div>
      <button type="button" className="secondary-button" disabled={!name.trim() || !location.trim()} onClick={() => void search()}>Rechercher sur Google</button>
      {busy && <p role="status">Recherche Google…</p>}{error && <p role="alert">{error}</p>}
      {searched && !results.length && <p>Aucun établissement trouvé. Modifiez le nom ou la ville/adresse.</p>}
      {results.length > 0 && <><h3>Résultats Google Maps</h3>{results.map(place => <div key={place.google_place_id} style={{ padding: 12, borderBottom: "1px solid #ddd" }}><strong>{place.name}</strong><p>{place.address} · {place.postal_code} {place.city}</p><p>{place.phone}{place.website && <> · <a href={place.website} target="_blank" rel="noreferrer">Site web</a></>}</p>{place.google_rating !== null && <p>⭐ {place.google_rating} {place.google_user_rating_count !== null && `· ${place.google_user_rating_count} avis`}</p>}<button type="button" className="secondary-button" onClick={() => {
        const { patch, preserved } = googleMerchantPatch(value, place);
        for (const [key, next] of Object.entries(patch)) onChange(key as Exclude<keyof CommerceForm, "category">, next);
        setSelected(place); setOpen(false); setNotice(preserved.length ? "Association sélectionnée. Les champs déjà renseignés ont été conservés ; les champs vides ont été complétés." : "Association sélectionnée et coordonnées complétées.");
      }}>Sélectionner {place.name}</button></div>)}</>}
    </div>}
  </fieldset>;
}
