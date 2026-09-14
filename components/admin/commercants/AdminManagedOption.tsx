"use client";

export default function AdminManagedOption({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <div>
    <label className="merchant-option">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} aria-describedby="admin-managed-help" />
      Page et jeux gérés par Proxiplay
    </label>
    <p id="admin-managed-help">Proxiplay administre la page et les jeux de ce commerce. Le commerçant conserve uniquement l’accès aux informations autorisées, notamment ses statistiques.</p>
  </div>;
}
