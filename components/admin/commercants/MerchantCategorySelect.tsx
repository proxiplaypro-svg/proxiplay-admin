"use client";
import { useEffect, useId, useState } from "react";
import type { MerchantCategory } from "@/lib/admin/merchantCategories";
import { fetchMerchantCategories } from "@/lib/admin/merchantCategoriesClient";

export default function MerchantCategorySelect({ value, onChange, disabled = false }: {
  value: string[]; onChange: (value: string[]) => void; disabled?: boolean;
}) {
  const id = useId();
  const [categories, setCategories] = useState<MerchantCategory[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let current = true;
    fetchMerchantCategories().then(items => {
      if (current) { setCategories(items); setState("ready"); }
    }).catch(() => { if (current) setState("error"); });
    return () => { current = false; };
  }, [attempt]);
  const active = categories.filter(category => category.active);
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visible = active.filter(category => normalize(category.label).includes(normalize(query)));
  const remove = (item: string) => onChange(value.filter(selected => selected !== item));
  return <fieldset disabled={disabled} className="game-edit-field" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <legend className="search-label">Catégories</legend>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {value.map((item, index) => {
        const category = categories.find(category => category.value === item);
        return <span key={`${item}-${index}`} className="secondary-button inline-secondary-button">
          {category?.label || item}{state === "ready" && !category?.active && <small> — ancienne catégorie</small>}
          <button type="button" aria-label={`Retirer ${category?.label || item}`} onClick={() => remove(item)} style={{ marginLeft: 8 }}>×</button>
        </span>;
      })}
    </div>
    {state === "loading" && <p role="status">Chargement des catégories…</p>}
    {state === "error" && <div role="alert"><p>Impossible de charger les catégories.</p><button type="button" className="secondary-button" onClick={() => { setState("loading"); setAttempt(attempt + 1); }}>Réessayer</button></div>}
    {state === "ready" && !active.length && <p role="status">Aucune catégorie disponible.</p>}
    {state === "ready" && active.length > 0 && <>
      <button type="button" className="secondary-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? "Fermer la liste" : "+ Ajouter une catégorie"}</button>
      {open && <div id={id} style={{ border: "1px solid var(--border, #d5d9d0)", borderRadius: 12, padding: 12 }} onKeyDown={event => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}>
        <label className="game-edit-field"><span className="search-label">Rechercher une catégorie</span><input className="search-input" type="search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} /></label>
        <div style={{ maxHeight: 240, overflowY: "auto", display: "grid", gap: 10, marginTop: 12 }}>
          {visible.map(category => <label key={category.value} className="merchant-option"><input type="checkbox" checked={value.includes(category.value)} onChange={event => event.target.checked ? onChange([...value, category.value]) : remove(category.value)} />{category.label}</label>)}
          {!visible.length && <p>Aucune catégorie correspondante.</p>}
        </div>
      </div>}
    </>}
  </fieldset>;
}
