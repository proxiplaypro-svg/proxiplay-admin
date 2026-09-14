"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase/auth";
import { merchantRequest, MerchantRequestError } from "@/lib/admin/merchantClient";
import CommerceFields, { emptyCommerce } from "@/components/admin/commercants/CommerceFields";
import AdminManagedOption from "@/components/admin/commercants/AdminManagedOption";

export default function NewMerchantPage() {
  const router = useRouter();
  const [commerce, setCommerce] = useState(emptyCommerce);
  const [managedByAdmin, setManagedByAdmin] = useState(false);
  const [account, setAccount] = useState({ first_name: "", last_name: "", email: "", account_phone: "" });
  const [mode, setMode] = useState<"new" | "existing" | "shop">("new");
  const [active, setActive] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [canAssociate, setCanAssociate] = useState(false);
  const [createdId, setCreatedId] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || createdId) return;
    setBusy(true); setError(""); setCanAssociate(false);
    try {
      const result = await merchantRequest("POST", { ...commerce, ...account, category: commerce.category.split(",").map(v => v.trim()).filter(Boolean), mode, active, managed_by_admin: managedByAdmin });
      setCreatedId(result.merchantId);
      let receipt = mode === "shop" ? "Fiche commerce créée sans compte." : "Commerce et compte associés. Aucune validation supplémentaire n’est nécessaire.";
      if (sendEmail && result.email) {
        try { await sendPasswordResetEmail(auth, result.email); receipt += " Email de définition du mot de passe envoyé."; }
        catch { receipt += " L’email n’a pas pu être envoyé. Utilisez le bouton de renvoi ci-dessous ; ne recréez pas le commerce."; }
      }
      try { sessionStorage.setItem(`merchant-created:${result.merchantId}`, receipt); } catch { /* Navigation remains available without session storage. */ }
      router.push(`/admin/commercants/${result.merchantId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "La création a échoué.");
      setCanAssociate(e instanceof MerchantRequestError && e.code === "existing-merchant");
    } finally { setBusy(false); }
  }
  return <section className="content-grid merchant-form-page">
    <header className="panel panel-wide merchant-form-card"><div className="panel-heading game-details-header"><div><h1>Nouveau commerçant</h1><p>Créez le commerce et son compte commerçant.</p></div><Link className="secondary-button inline-secondary-button" href="/admin/commercants">Retour aux commerçants</Link></div></header>
    <form className="panel-wide game-edit-form" onSubmit={submit}>
      <fieldset disabled={busy || Boolean(createdId)} className="merchant-fieldset game-edit-form">
        <div className="panel merchant-form-card"><h2>Gestion du commerce</h2><AdminManagedOption checked={managedByAdmin} onChange={setManagedByAdmin} /></div>
        <div className="panel merchant-form-card"><div className="panel-heading"><h2>Commerce</h2><p>Les informations de la fiche visible par les joueurs.</p></div><CommerceFields value={commerce} onChange={(key, value) => setCommerce(current => ({ ...current, [key]: value }))} /></div>
        <div className="panel merchant-form-card"><div className="panel-heading"><h2>Compte commerçant</h2><p>Le propriétaire pourra définir son mot de passe par email.</p></div>
          <label className="game-edit-field"><span className="search-label">Type de création</span><select className="search-input" value={mode} onChange={e => { setMode(e.target.value as typeof mode); setConfirmed(false); setError(""); }}><option value="new">Créer un nouveau compte commerçant</option><option value="existing">Associer un compte commerçant existant</option><option value="shop">Créer uniquement la fiche commerce</option></select></label>
          {mode !== "shop" && <div className="game-edit-grid">{([ ["first_name", "Prénom", "text"], ["last_name", "Nom", "text"], ["email", "Email du commerçant", "email"], ["account_phone", "Téléphone du commerçant", "tel"] ] as const).filter(([key]) => mode === "new" || key === "email").map(([key, label, type]) => <label key={key} className="game-edit-field"><span className="search-label">{label}</span><input className="search-input" type={type} required={key === "email"} maxLength={key === "email" ? 300 : key === "account_phone" ? 50 : 100} value={account[key]} onChange={e => { setAccount({ ...account, [key]: e.target.value }); setCanAssociate(false); setConfirmed(false); }} /></label>)}</div>}
          {mode === "shop" && <p>Préparez la fiche maintenant et associez un compte commerçant depuis sa fiche plus tard.</p>}
          {mode === "existing" && <label className="merchant-option"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Je confirme l’association de ce compte existant. Son profil et son statut seront conservés.</label>}
        </div>
        {mode !== "shop" && <div className="panel merchant-form-card"><div className="panel-heading"><h2>Options</h2></div>{mode === "new" && <label className="merchant-option"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Activer immédiatement le compte commerçant</label>}<label className="merchant-option"><input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />Envoyer un email pour définir le mot de passe</label><p>L’email permet de choisir un mot de passe. Il ne sert pas à valider l’inscription.</p></div>}
        {error && <div className="dashboard-banner error" role="alert"><p>{error}</p>{canAssociate && <button className="secondary-button" type="button" onClick={() => { setMode("existing"); setConfirmed(false); setCanAssociate(false); setError(""); }}>Associer ce compte existant au commerce</button>}</div>}
        <div className="dashboard-actions"><button className="primary-button" type="submit" disabled={mode === "existing" && !confirmed}>{busy ? "Création…" : mode === "shop" ? "Créer uniquement la fiche" : "Créer le commerçant"}</button><Link className="secondary-button inline-secondary-button" href="/admin/commercants">Annuler</Link></div>
      </fieldset>
      {createdId && <Link className="primary-button" href={`/admin/commercants/${createdId}`}>Ouvrir la fiche créée</Link>}
    </form>
  </section>;
}
