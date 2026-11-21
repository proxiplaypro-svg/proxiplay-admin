"use client";

// Phase 1, tranche 1, lot 1.4b : commerciaux, liens de souscription nominatifs
// et miroir des codes promotionnels (CGV V2.1, art. 4.2 et 6). Toutes les
// ecritures passent par le backend canonique ; le parcours doit etre ouvert
// (app_config/merchant_contracts.enabled) pour qu'elles aient un effet.
import { useEffect, useState, type FormEvent } from "react";
import { parsePromoForm, promoLabel, repLinkUrl } from "@/lib/admin/merchantContracts";
import {
  createRepLink,
  listPromoCodes,
  listSalesReps,
  upsertPromoCode,
  upsertSalesRep,
  type PromoCodeItem,
  type SalesRep,
} from "@/lib/firebase/merchantContractAdmin";

const inputClass = "rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-[14px]";
const buttonClass = "w-fit rounded-lg bg-[#2B285F] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50";
const cardClass = "grid gap-4 rounded-2xl border border-[#E5E5E0] bg-white p-5";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Action impossible.";
}

export default function AdminCommerciauxPage() {
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [codes, setCodes] = useState<PromoCodeItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const load = async () => {
    try {
      const [repList, codeList] = await Promise.all([listSalesReps(), listPromoCodes()]);
      setReps(repList);
      setCodes(codeList);
    } catch (err) {
      console.error(err);
      setError("Impossible de charger les commerciaux et les codes.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const run = async (action: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      if (result) setMessage(result);
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const onRep = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      await upsertSalesRep({
        name: String(form.get("name") || ""),
        email: String(form.get("email") || "") || undefined,
        active: true,
      });
      return "Commercial enregistré.";
    });
  };

  const onLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const link = await createRepLink({
        repId: String(form.get("repId") || ""),
        enseigneName: String(form.get("enseigneName") || "") || undefined,
        siret: String(form.get("siret") || "") || undefined,
      });
      setLastLink(repLinkUrl(link.path));
      return "Lien créé : copiez-le maintenant, il ne sera plus affiché.";
    });
  };

  const onCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      await upsertPromoCode(parsePromoForm({
        code: String(form.get("code") || ""),
        kind: String(form.get("kind") || ""),
        value: String(form.get("value") || ""),
        offers: form.getAll("offers").map(String),
        validUntil: String(form.get("validUntil") || ""),
        maxUses: String(form.get("maxUses") || ""),
        repId: String(form.get("repId") || ""),
        active: form.get("active") === "on",
      }));
      return "Code enregistré dans le miroir Firestore.";
    });
  };

  const activeReps = reps.filter((rep) => rep.active);

  return (
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto grid max-w-[1100px] gap-6">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1a1a1a]">Commerciaux, liens et codes</h1>
          <p className="mt-1 text-[14px] text-[#666]">
            Une souscription faite par un lien ou un code remis par un commercial est démarchée (CGV V2.1, art. 4.2).
            Les codes promotionnels sont gérés ici uniquement : rien ne se modifie à la main dans Stripe.
          </p>
        </div>
        {message ? <p className="rounded-lg bg-[#EAF3DE] px-4 py-3 text-[14px] text-[#3B6D11]">{message}</p> : null}
        {error ? <p className="rounded-lg bg-[#FCEBEB] px-4 py-3 text-[14px] text-[#A32D2D]">{error}</p> : null}

        <div className={cardClass}>
          <h2 className="text-[16px] font-medium">Commerciaux</h2>
          <ul className="grid gap-1 text-[14px]">
            {reps.map((rep) => (
              <li key={rep.id}>{rep.name}{rep.email ? ` · ${rep.email}` : ""}{rep.active ? "" : " (désactivé)"}</li>
            ))}
          </ul>
          <form className="flex flex-wrap gap-2" onSubmit={onRep}>
            <input className={inputClass} name="name" placeholder="Nom" required minLength={2} />
            <input className={inputClass} name="email" type="email" placeholder="E-mail (facultatif)" />
            <button className={buttonClass} disabled={busy} type="submit">Ajouter</button>
          </form>
        </div>

        <div className={cardClass}>
          <h2 className="text-[16px] font-medium">Lien de souscription nominatif</h2>
          <form className="flex flex-wrap gap-2" onSubmit={onLink}>
            <select className={inputClass} name="repId" required>
              {activeReps.map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
            </select>
            <input className={inputClass} name="enseigneName" placeholder="Enseigne (préremplissage)" />
            <input className={inputClass} name="siret" placeholder="SIRET (préremplissage)" />
            <button className={buttonClass} disabled={busy || !activeReps.length} type="submit">Créer le lien</button>
          </form>
          {lastLink ? <code className="break-all rounded-lg bg-[#F7F7F5] px-3 py-2 text-[13px]">{lastLink}</code> : null}
        </div>

        <div className={cardClass}>
          <h2 className="text-[16px] font-medium">Codes promotionnels (première année uniquement)</h2>
          <table className="text-left text-[13px]">
            <thead>
              <tr><th>Code</th><th>Remise</th><th>Offres</th><th>Utilisations</th><th>Commercial</th><th>État</th></tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.code}>
                  <td>{code.code}</td>
                  <td>{promoLabel(code)}</td>
                  <td>{code.offers.length ? code.offers.join(", ") : "toutes"}</td>
                  <td>{code.uses}{code.maxUses ? ` / ${code.maxUses}` : ""}</td>
                  <td>{reps.find((rep) => rep.id === code.repId)?.name || "—"}</td>
                  <td>{code.active ? "actif" : "inactif"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <form className="grid gap-2 md:grid-cols-4" onSubmit={onCode}>
            <input className={inputClass} name="code" placeholder="CODE" required />
            <select className={inputClass} name="kind" defaultValue="percent">
              <option value="percent">Pourcentage</option>
              <option value="amount">Montant HT (€)</option>
            </select>
            <input className={inputClass} name="value" placeholder="Valeur" required />
            <input className={inputClass} name="maxUses" placeholder="Utilisations max (facultatif)" />
            <label className="text-[13px]"><input name="offers" type="checkbox" value="autonome" /> Autonome</label>
            <label className="text-[13px]"><input name="offers" type="checkbox" value="accompagnee" /> Accompagnée</label>
            <input className={inputClass} name="validUntil" type="date" />
            <select className={inputClass} name="repId" defaultValue="">
              <option value="">Aucun commercial (spontané)</option>
              {activeReps.map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
            </select>
            <label className="text-[13px]"><input name="active" type="checkbox" defaultChecked /> Actif</label>
            <button className={buttonClass} disabled={busy} type="submit">Enregistrer le code</button>
          </form>
        </div>
      </div>
    </section>
  );
}
