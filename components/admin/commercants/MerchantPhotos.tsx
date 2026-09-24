"use client";
import type { MerchantPhotosState } from "./useMerchantPhotos";
export default function MerchantPhotos({ state, disabled }: { state: MerchantPhotosState; disabled?: boolean }) {
  return <div style={{ gridColumn: "1 / -1" }}><fieldset className="game-edit-field" disabled={disabled || state.busy || state.unavailable} style={{ border: 0, padding: 0, margin: 0 }}>
    <legend className="search-label">Photos du commerce</legend>
    {state.loading && <p role="status">Chargement des photos…</p>}
    {state.error && <p role="alert">{state.error}</p>}
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>{state.photos.map((photo, index) => <div key={photo.id} style={{ width: 180 }}>
      {/* Local previews and legacy Firebase URLs require no Next image proxy. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={`Photo ${index + 1} du commerce`} style={{ width: 180, height: 130, objectFit: "cover", borderRadius: 12 }} />
      <p>{index === 0 ? "⭐ Principale" : `Photo ${index + 1}`}</p>
      {index > 0 && <button type="button" className="secondary-button" onClick={() => state.change([photo, ...state.photos.filter(item => item.id !== photo.id)])}>Définir principale</button>}
      {index > 1 && <button type="button" onClick={() => { const next = [...state.photos]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; state.change(next); }}>Déplacer avant</button>}
      <button type="button" className="secondary-button" aria-label={`Supprimer la photo ${index + 1}`} onClick={() => state.change(state.photos.filter(item => item.id !== photo.id))}>Supprimer</button>
    </div>)}</div>
    <label className="game-edit-field">+ Ajouter des photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={state.photos.length >= 5} onChange={event => { const files = [...(event.target.files || [])]; event.target.value = ""; if (files.length) void state.add(files); }} /></label>
    <p>JPEG, PNG ou WebP · 12 Mo par photo · 5 photos maximum. Les images sont optimisées avant envoi.</p>
    {state.busy && <p role="status">{state.progress === null ? "Optimisation des photos…" : state.progress === 100 ? "Photos transférées, enregistrement…" : `Téléversement : ${state.progress} %`}</p>}
    {state.notice && <p role="status">{state.notice}</p>}
  </fieldset>{state.error && state.load && !state.loading && <button type="button" className="secondary-button" disabled={disabled || state.busy} onClick={() => { if (!state.dirty || window.confirm("Recharger les photos et abandonner les changements non enregistrés ?")) void state.load?.(); }}>Recharger la galerie</button>}</div>;
}
