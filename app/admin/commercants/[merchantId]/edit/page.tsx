"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client-app";
import { auth } from "@/lib/firebase/auth";
import { merchantRequest } from "@/lib/admin/merchantClient";
import { uploadMerchantPhoto } from "@/lib/firebase/merchantsQueries";
import CommerceFields, { emptyCommerce, type CommerceForm } from "@/components/admin/commercants/CommerceFields";
import MerchantAccount from "@/components/admin/commercants/MerchantAccount";
import AdminManagedOption from "@/components/admin/commercants/AdminManagedOption";

const emptyCrm = { contact_name: "", commercial_status: "", admin_note: "", last_contact_at: "", last_contact_channel: "" };
export default function MerchantEditPage({ params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = use(params);
  const [commerce, setCommerce] = useState(emptyCommerce);
  const [managedByAdmin, setManagedByAdmin] = useState(false);
  const [crm, setCrm] = useState(emptyCrm);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      await auth.authStateReady();
      const snapshot = await getDoc(doc(db, "enseignes", merchantId));
      if (!snapshot.exists()) throw new Error("Commerce introuvable.");
      if (cancelled) return;
      const data = snapshot.data();
      setManagedByAdmin(data.managed_by_admin === true);
      const next = { ...emptyCommerce };
      for (const key of Object.keys(next) as (keyof CommerceForm)[]) next[key] = typeof data[key] === "string" ? data[key] : "";
      next.category = Array.isArray(data.category) ? data.category.join(", ") : "";
      next.phone ||= data.phone_number ?? "";
      next.site_web_url ||= data.website ?? "";
      next.imageUrl ||= data.logo ?? "";
      const nextCrm = { ...emptyCrm };
      for (const key of Object.keys(nextCrm) as (keyof typeof emptyCrm)[]) nextCrm[key] = typeof data[key] === "string" ? data[key] : "";
      if (data.last_contact_at instanceof Timestamp) {
        const date = data.last_contact_at.toDate();
        nextCrm.last_contact_at = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }
      setCommerce(next); setCrm(nextCrm); setLoaded(true);
    }
    load().catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [merchantId]);
  function changed(key: string) { setDirty(current => new Set(current).add(key)); }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const fields: Record<string, unknown> = {};
      const values = { ...commerce, ...crm, managed_by_admin: managedByAdmin };
      for (const key of dirty) fields[key] = values[key as keyof typeof values];
      if (dirty.has("category")) fields.category = commerce.category.split(",").map(v => v.trim()).filter(Boolean);
      if (dirty.has("last_contact_at") && crm.last_contact_at) fields.last_contact_at = new Date(crm.last_contact_at).toISOString();
      if (photo) {
        const url = await uploadMerchantPhoto(merchantId, photo);
        fields.imageUrl = url;
        setCommerce(current => ({ ...current, imageUrl: url }));
        changed("imageUrl"); setPhoto(null);
      }
      await merchantRequest("PATCH", { action: "profile", fields }, merchantId);
      setDirty(new Set()); setMessage("Fiche commerce enregistrée.");
    } catch (e) { setError(e instanceof Error ? e.message : "L’enregistrement a échoué."); }
    finally { setBusy(false); }
  }
  return <section className="content-grid merchant-form-page">
    <header className="panel panel-wide merchant-form-card"><div className="panel-heading game-details-header"><div><h1>Modifier le commerçant</h1><p>Modifiez le commerce et gérez le compte de son propriétaire.</p></div><Link href={`/admin/commercants/${merchantId}`} className="secondary-button inline-secondary-button">Retour à la fiche</Link></div></header>
    {loading && <p>Chargement du commerce…</p>}
    {error && <div className="panel-wide dashboard-banner error" role="alert">{error}</div>}
    {loaded && <>
      <form className="panel panel-wide merchant-form-card game-edit-form" onSubmit={save}>
        <fieldset disabled={busy} className="merchant-fieldset game-edit-form">
          <AdminManagedOption checked={managedByAdmin} onChange={value => { setManagedByAdmin(value); changed("managed_by_admin"); }} />
          <div className="panel-heading"><h2>Commerce</h2></div>
          <CommerceFields value={commerce} onChange={(key, value) => { setCommerce(current => ({ ...current, [key]: value })); changed(key); }} />
          <label className="game-edit-field"><span className="search-label">Importer une photo (JPEG, PNG ou WebP, 5 Mo maximum)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0] ?? null; if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) { setError("Choisissez une image JPEG, PNG ou WebP de 5 Mo maximum."); e.target.value = ""; setPhoto(null); return; } setPhoto(file); setError(""); }} /></label>
          {(commerce.imageUrl || photo) && <div><p>{photo ? `Photo sélectionnée : ${photo.name}` : "Une photo est associée au commerce."}</p><button className="secondary-button" type="button" onClick={() => { setPhoto(null); setCommerce(current => ({ ...current, imageUrl: "" })); changed("imageUrl"); }}>Retirer la photo</button></div>}
          <div className="panel-heading"><h2>Suivi commercial</h2><p>Le statut commercial sert au suivi de la relation. L’accès du compte se gère séparément ci-dessous.</p></div>
          <div className="game-edit-grid">
            {([ ["contact_name", "Contact principal", "text"], ["last_contact_at", "Dernier contact", "datetime-local"], ["last_contact_channel", "Dernier canal utilisé", "text"] ] as const).map(([key, label, type]) => <label className="game-edit-field" key={key}><span className="search-label">{label}</span><input className="search-input" type={type} value={crm[key]} onChange={e => { setCrm(current => ({ ...current, [key]: e.target.value })); changed(key); }} /></label>)}
            <label className="game-edit-field"><span className="search-label">Statut commercial</span><select className="search-input" value={crm.commercial_status} onChange={e => { setCrm(current => ({ ...current, commercial_status: e.target.value })); changed("commercial_status"); }}><option value="">Non renseigné</option><option value="actif">Actif</option><option value="a_relancer">À relancer</option><option value="inactif">Inactif</option></select></label>
            <label className="game-edit-field"><span className="search-label">Note admin</span><textarea className="search-input" rows={4} maxLength={5000} value={crm.admin_note} onChange={e => { setCrm(current => ({ ...current, admin_note: e.target.value })); changed("admin_note"); }} /></label>
          </div>
          {message && <div className="dashboard-banner success" role="status">{message}</div>}
          <div className="dashboard-actions"><button type="submit" className="primary-button" disabled={!dirty.size && !photo}>{busy ? "Enregistrement…" : "Enregistrer le commerce"}</button><Link className="secondary-button inline-secondary-button" href={`/admin/commercants/${merchantId}`}>Annuler</Link></div>
        </fieldset>
      </form>
      <MerchantAccount merchantId={merchantId} />
    </>}
  </section>;
}
