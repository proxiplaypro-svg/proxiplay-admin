"use client";

// E-mails du parcours de souscription en echec et alertes administratives
// (SMTP = point de defaillance unique). La file de reprise retente seule ;
// l'admin peut relancer tout de suite, abandonner (apres action manuelle) et
// marquer une alerte comme traitee. Toutes les actions passent par le backend.
import { useEffect, useState } from "react";
import {
  abandonMailOutbox,
  listMailOutbox,
  listOpenAlerts,
  resolveAlert,
  retryMailOutbox,
  type AdminAlert,
  type OutboxItem,
} from "@/lib/firebase/merchantContractAdmin";

const smallButton = "rounded-lg border border-[#E5E5E0] bg-white px-2 py-1 text-[12px] disabled:opacity-50";

export function MailOutboxPanel() {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [outbox, open] = await Promise.all([listMailOutbox(), listOpenAlerts()]);
      setItems(outbox);
      setAlerts(open);
    } catch (err) {
      console.error(err);
      setError("File des e-mails illisible.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  };

  if (!items.length && !alerts.length && !error) return null;
  return (
    <div className="grid gap-3 rounded-2xl border border-[#F0C2C2] bg-white p-5">
      <h2 className="text-[16px] font-medium text-[#A32D2D]">E-mails en échec et alertes</h2>
      {error ? <p className="text-[13px] text-[#A32D2D]">{error}</p> : null}
      <ul className="grid gap-2 text-[13px]">
        {alerts.map((alert) => (
          <li key={alert.id} className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{alert.kind}</span>
            <span>{alert.detail}</span>
            <button type="button" className={smallButton} disabled={busy} onClick={() => void run(() => resolveAlert(alert.id))}>Traitée</button>
          </li>
        ))}
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.key}</span>
            <span>{item.status === "failed" ? "abandon automatique" : "nouvelle tentative programmée"} · {item.attempts} tentative(s)</span>
            {item.contractId ? <span>· demande {item.contractId}</span> : null}
            {item.lastError ? <span className="text-[#666]">· {item.lastError}</span> : null}
            <button type="button" className={smallButton} disabled={busy} onClick={() => void run(() => retryMailOutbox(item.id))}>Relancer</button>
            <button type="button" className={smallButton} disabled={busy}
              onClick={() => window.confirm("Abandonner cet envoi ? Prévenez le commerçant autrement.") && void run(() => abandonMailOutbox(item.id))}>
              Abandonner
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
