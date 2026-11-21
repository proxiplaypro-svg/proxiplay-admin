"use client";

// Configuration du parcours de souscription V2.1 : CGV en vigueur, adresse
// des alertes, interrupteur. Ecrite uniquement par le backend canonique
// (adminUpdateMerchantContractsConfig : validation, controle du PDF dans
// Storage, journal). Les fonctions admin restent utilisables interrupteur
// coupe ; seules les fonctions cote commercant et la confirmation en dependent.
import { useEffect, useState, type FormEvent } from "react";
import { parseConfigForm } from "@/lib/admin/merchantContracts";
import { getContractsConfig, updateContractsConfig, type ContractsConfig } from "@/lib/firebase/merchantContractAdmin";

const inputClass = "rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-[14px]";
const buttonClass = "w-fit rounded-lg bg-[#2B285F] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50";

export function MerchantContractsConfigPanel() {
  const [config, setConfig] = useState<ContractsConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setConfig(await getContractsConfig());
    } catch (err) {
      console.error(err);
      setError("Configuration illisible.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await action());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Modification impossible.");
    } finally {
      setBusy(false);
    }
  };

  const onSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (key: string) => String(form.get(key) || "");
    void run(async () => {
      await updateContractsConfig(parseConfigForm({
        version: get("version"), sha256: get("sha256"), storagePath: get("storagePath"),
        url: get("url"), effectiveDate: get("effectiveDate"), adminAlertEmail: get("adminAlertEmail"),
      }));
      return "Configuration enregistrée (journalisée).";
    });
  };

  const toggle = (enabled: boolean) => {
    const text = enabled ?
      "Ouvrir la souscription en ligne aux commerçants ? Le PDF des CGV sera revérifié." :
      "Fermer la souscription en ligne ? Les demandes déjà reçues restent à traiter.";
    if (!window.confirm(text)) return;
    void run(async () => {
      await updateContractsConfig({ enabled });
      return enabled ? "Parcours ouvert." : "Parcours fermé.";
    });
  };

  return (
    <div className="grid gap-3 rounded-2xl border border-[#E5E5E0] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-medium">
          Souscription en ligne : {config?.enabled ? "ouverte" : "fermée"}
        </h2>
        <button type="button" className={buttonClass} disabled={busy || !config}
          onClick={() => toggle(!config?.enabled)}>
          {config?.enabled ? "Fermer le parcours" : "Ouvrir le parcours"}
        </button>
      </div>
      {message ? <p className="text-[13px] text-[#3B6D11]">{message}</p> : null}
      {error ? <p className="text-[13px] text-[#A32D2D]">{error}</p> : null}
      <form key={JSON.stringify(config)} className="grid gap-2 md:grid-cols-3" onSubmit={onSave}>
        <input className={inputClass} name="version" defaultValue={config?.cgv?.version || ""} placeholder="Version des CGV (ex. 2.1)" />
        <input className={inputClass} name="effectiveDate" type="date" defaultValue={config?.cgv?.effective_date || ""} />
        <input className={inputClass} name="sha256" defaultValue={config?.cgv?.sha256 || ""} placeholder="Empreinte SHA-256 du PDF" />
        <input className={inputClass} name="storagePath" defaultValue={config?.cgv?.storage_path || ""} placeholder="Chemin Storage (ex. legal/cgv/CGV_V2.1.pdf)" />
        <input className={inputClass} name="url" defaultValue={config?.cgv?.url || ""} placeholder="Adresse publique du PDF (https)" />
        <input className={inputClass} name="adminAlertEmail" type="email" defaultValue={config?.adminAlertEmail || ""} placeholder="Adresse des alertes (défaut : contact@proxiplay.fr)" />
        <button className={buttonClass} disabled={busy} type="submit">Enregistrer</button>
      </form>
    </div>
  );
}
