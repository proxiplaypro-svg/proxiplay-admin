"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client-app";

// Shared by the Parrainage and Parrainage commerçants pages: both edit the
// single app_config/merchant_referral flag read by the mobile app and backend.
export function MerchantReferralProgramToggle() {
  const [programEnabled, setProgramEnabled] = useState<boolean | null>(null);
  const [configMissing, setConfigMissing] = useState(false);
  const [configBusy, setConfigBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onSnapshot(doc(db, "app_config", "merchant_referral"),
    (snapshot) => {
      setConfigMissing(typeof snapshot.data()?.enabled !== "boolean");
      setProgramEnabled(snapshot.data()?.enabled !== false);
    },
    () => setProgramEnabled(null)), []);

  const setProgramStatus = async (enabled: boolean) => {
    setConfigBusy(true);
    setError(null);
    try {
      await setDoc(doc(db, "app_config", "merchant_referral"), { enabled }, { merge: true });
    } catch {
      setError("Impossible de modifier le programme de parrainage.");
    } finally {
      setConfigBusy(false);
    }
  };

  return (
    <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
      <p className="text-sm text-[#666]">Parrainage commerçant</p>
      <p className={`font-medium ${programEnabled === null ? "text-[#666]" : programEnabled ? "text-[#3B6D11]" : "text-[#A32D2D]"}`}>
        {programEnabled === null ? "État du programme indisponible" : programEnabled ? "Programme activé" : "Programme désactivé"}
      </p>
      <p className="mt-1 text-sm text-[#666]">La désactivation bloque les nouveaux parrainages ; les dossiers existants restent accessibles et peuvent être traités.</p>
      {configMissing && <p className="mt-1 text-sm text-[#666]">Réglage non initialisé : les créations restent autorisées mais le bandeau mobile est masqué. Activez le programme pour initialiser le réglage.</p>}
      {configMissing && <button type="button" disabled={configBusy} onClick={() => void setProgramStatus(true)}
        className="mt-3 mr-3 rounded-[8px] border border-[#639922] px-4 py-2 text-sm text-[#639922] disabled:opacity-50">Activer le programme</button>}
      <button type="button" disabled={programEnabled === null || configBusy}
        onClick={() => programEnabled !== null && void setProgramStatus(!programEnabled)}
        className="mt-3 rounded-[8px] border border-[#639922] px-4 py-2 text-sm text-[#639922] disabled:opacity-50">
        {programEnabled ? "Désactiver le programme" : "Activer le programme"}
      </button>
      {error && <p className="feedback error mt-3">{error}</p>}
    </div>
  );
}
