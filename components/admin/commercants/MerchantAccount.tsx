"use client";
import { useEffect, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase/auth";
import { merchantRequest } from "@/lib/admin/merchantClient";

type Account = { uid: string; email: string; first_name: string; last_name: string; account_phone: string; active: boolean; role: string };
export default function MerchantAccount({ merchantId }: { merchantId: string }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [owner, setOwner] = useState("");
  const [email, setEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    merchantRequest("GET", undefined, merchantId).then(result => {
      if (cancelled) return;
      setAccount(result.account); setOwner(result.account?.uid ?? result.ownerUid ?? "");
      const receipt = sessionStorage.getItem(`merchant-created:${merchantId}`);
      if (receipt) { setMessage(receipt); sessionStorage.removeItem(`merchant-created:${merchantId}`); }
      else if (result.warning) setMessage(result.warning);
    }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [merchantId]);
  async function run(action: "update" | "associate" | "reset") {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await merchantRequest("PATCH", { ...account, action, expectedOwner: owner, ...(action === "associate" ? { email } : {}) }, merchantId);
      if (action === "reset") {
        try { await sendPasswordResetEmail(auth, result.email); }
        catch { throw new Error("L’email n’a pas pu être envoyé. Le compte est conservé ; réessayez l’envoi plus tard."); }
        setMessage("Email de définition du mot de passe envoyé.");
      } else {
        setAccount(result.account); setOwner(result.account?.uid ?? result.ownerUid ?? ""); setConfirmed(false); setEmail("");
        setMessage(action === "associate" ? "Compte associé. Son profil et son statut ont été conservés." : "Compte commerçant enregistré.");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "L’opération a échoué."); }
    finally { setBusy(false); }
  }
  return <div className="panel panel-wide merchant-form-card">
    <div className="panel-heading"><h2>Compte commerçant associé</h2><p>Gérez l’identité, l’accès et le mot de passe du propriétaire.</p></div>
    {loading ? <p>Chargement du compte…</p> : <>
      {account ? <form className="game-edit-form" onSubmit={e => { e.preventDefault(); void run("update"); }}>
        <p><strong>{account.email}</strong> · {account.active ? "Actif" : "Désactivé"}</p>
        <p className="muted">Une modification de l’email met à jour l’adresse de connexion et celle de ses commerces. Pour changer de propriétaire, associez un autre compte ci-dessous.</p>
        <fieldset disabled={busy || account.role !== "commercant"} className="merchant-fieldset">
          <label className="game-edit-field"><span className="search-label">Email du commerçant</span><input className="search-input" type="email" required maxLength={300} value={account.email} onChange={e => setAccount({ ...account, email: e.target.value })} /></label>
          <div className="game-edit-grid">{([ ["first_name", "Prénom"], ["last_name", "Nom"], ["account_phone", "Téléphone du commerçant"] ] as const).map(([key, label]) => <label key={key} className="game-edit-field"><span className="search-label">{label}</span><input className="search-input" maxLength={key === "account_phone" ? 50 : 100} value={account[key]} onChange={e => setAccount({ ...account, [key]: e.target.value })} /></label>)}</div>
          <label className="merchant-option"><input type="checkbox" checked={account.active} onChange={e => setAccount({ ...account, active: e.target.checked })} />Compte commerçant actif (pour tous ses commerces)</label>
          <div className="dashboard-actions"><button className="primary-button" type="submit">Enregistrer le compte</button><button className="secondary-button" type="button" onClick={() => void run("reset")}>Envoyer un email de définition / réinitialisation du mot de passe</button></div>
        </fieldset>
        {account.role !== "commercant" && <p>Ce profil ne possède pas le rôle commerçant. Associez un compte commerçant existant.</p>}
      </form> : <p>Aucun compte commerçant associé.</p>}
      <form className="game-edit-form merchant-association" onSubmit={e => { e.preventDefault(); if (confirmed) void run("associate"); }}>
        <h3>{owner ? "Changer le propriétaire" : "Associer un compte commerçant"}</h3>
        <p>Saisissez l’email d’un compte déjà commerçant. Son identité et son statut seront conservés.</p>
        <label className="game-edit-field"><span className="search-label">Email du compte existant</span><input className="search-input" type="email" required value={email} disabled={busy} onChange={e => { setEmail(e.target.value); setConfirmed(false); }} /></label>
        <label className="merchant-option"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />Je confirme l’association de ce compte à ce commerce{owner ? " et le remplacement du propriétaire actuel" : ""}.</label>
        <button className="secondary-button" disabled={busy || !confirmed} type="submit">Associer ce compte existant au commerce</button>
      </form>
    </>}
    {error && <div className="dashboard-banner error" role="alert">{error}</div>}
    {message && <div className="dashboard-banner success" role="status">{message}</div>}
  </div>;
}
