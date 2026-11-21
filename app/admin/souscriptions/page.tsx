"use client";

// Phase 1, tranche 1 : file de verification des demandes de souscription
// (CGV V2.1, art. 4.1 ; checklist G). Premiere version : verification
// manuelle de chaque demande, dans les deux jours ouvres. Les decisions
// passent par le backend canonique, avec la version du dossier affiche.
import { useEffect, useState, type FormEvent } from "react";
import { MerchantContractsConfigPanel } from "@/components/admin/MerchantContractsConfigPanel";
import { MailOutboxPanel } from "@/components/admin/MailOutboxPanel";
import {
  CHECKS,
  CHECK_RESULT_LABELS,
  CONTRACT_STATE_LABELS,
  REFUSAL_MOTIFS,
  blockingChecks,
  canRecordWithdrawal,
  canSendPaymentInvitation,
  checksFromForm,
  formatCents,
  type RefusalMotif,
} from "@/lib/admin/merchantContracts";
import {
  confirmContract,
  findSimilarEnseignes,
  getEnseigneSubscription,
  getContractInternal,
  listContracts,
  recordChecks,
  recordWithdrawal,
  refuseContract,
  sendPaymentInvitation,
  type AdminContract,
  type AdminContractInternal,
  type EnseigneSubscription,
  type SimilarEnseignes,
} from "@/lib/firebase/merchantContractAdmin";

const inputClass = "rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-[14px]";
const buttonClass = "w-fit rounded-lg bg-[#2B285F] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50";
const dangerClass = "w-fit rounded-lg bg-[#A32D2D] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50";
const cardClass = "grid gap-3 rounded-2xl border border-[#E5E5E0] bg-white p-5";

function dateLabel(value?: { toDate: () => Date } | null): string {
  return value ? value.toDate().toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "—";
}

// Lot 1.3 : alertes envoyees par la tache planifiee (1 jour ouvre, puis
// alerte prioritaire au-dela de 2 jours ouvres).
function alertLabel(alerts?: Record<string, unknown>): string {
  const sent = (key: string) => !!(alerts?.[key] as { sent_at?: unknown } | undefined)?.sent_at;
  if (sent("priority")) return "Alerte prioritaire envoyée : délai de deux jours ouvrés dépassé";
  if (sent("first")) return "Alerte envoyée : en attente depuis un jour ouvré";
  return "Aucune";
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Action impossible.";
}

export default function AdminSouscriptionsPage() {
  const [state, setState] = useState("submitted");
  const [items, setItems] = useState<AdminContract[]>([]);
  const [selected, setSelected] = useState<AdminContract | null>(null);
  const [internal, setInternal] = useState<AdminContractInternal | null>(null);
  const [similar, setSimilar] = useState<SimilarEnseignes | null>(null);
  const [mirror, setMirror] = useState<EnseigneSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (keepId?: string) => {
    try {
      const list = await listContracts(state);
      setItems(list);
      const next = keepId ? list.find((item) => item.id === keepId) || null : null;
      setSelected(next);
      setInternal(next ? await getContractInternal(next.id) : null);
      setSimilar(null);
    } catch (err) {
      console.error(err);
      setError("Impossible de charger les demandes.");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const open = async (item: AdminContract) => {
    setSelected(item);
    setMessage(null);
    setError(null);
    setSimilar(null);
    setInternal(await getContractInternal(item.id));
    setMirror(item.data.enseigne_id ? await getEnseigneSubscription(item.data.enseigne_id) : null);
  };

  const run = async (action: () => Promise<string>) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await action());
      await load(selected.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const onChecks = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const entries = Object.fromEntries(CHECKS.map((check) => [check.id, {
      result: String(form.get(`result-${check.id}`) || ""),
      note: String(form.get(`note-${check.id}`) || ""),
    }]));
    const enseigneId = String(form.get("enseigneId") || "").trim();
    void run(async () => {
      await recordChecks({
        contractId: selected.id,
        expectedVersion: selected.data.state_version || 0,
        checks: checksFromForm(entries),
        ...(enseigneId && enseigneId !== selected.data.enseigne_id ? { enseigneId } : {}),
      });
      return "Contrôles enregistrés.";
    });
  };

  // Lot 1.4 : confirmation = conclusion du contrat (art. 4.1). Le serveur
  // reverifie tout (8 controles, enseigne du demandeur, CGV et PDF).
  const onConfirm = () => {
    if (!selected) return;
    if (!window.confirm("Confirmer la souscription ? La confirmation est envoyée au commerçant avec les CGV : le contrat est conclu à l'envoi. Cette décision est définitive.")) return;
    void run(async () => {
      const result = await confirmContract({ contractId: selected.id, expectedVersion: selected.data.state_version || 0 });
      return `Souscription confirmée le ${new Date(result.confirmedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}.`;
    });
  };

  // Lot 1.6 : envoi ou renvoi de l'invitation a payer (lien de 15 jours ;
  // un renvoi revoque l'ancien lien et garde la date d'expiration).
  const onSendInvitation = () => {
    if (!selected) return;
    if (!window.confirm("Envoyer l'invitation à payer ? Un lien précédent sera révoqué.")) return;
    void run(async () => {
      const result = await sendPaymentInvitation(selected.id);
      return result.sent ? "Invitation à payer envoyée." : "Envoi en échec : mis en file de reprise, alerte créée.";
    });
  };

  // Lot 1.5 : retractation par e-mail ou courrier ; la date d'envoi fait foi.
  const onWithdrawal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    if (!window.confirm("Enregistrer la rétractation ? Le commerçant reçoit un accusé de réception ; un paiement déjà reçu est remboursé.")) return;
    void run(async () => {
      const result = await recordWithdrawal({
        contractId: selected.id,
        channel: String(form.get("channel")) as "email" | "courrier",
        sentAt: String(form.get("sentAt") || ""),
        receivedAt: String(form.get("receivedAt") || "") || undefined,
        reference: String(form.get("reference") || ""),
        lateReason: String(form.get("lateReason") || "") || undefined,
      });
      return result.refunded ? "Rétractation enregistrée ; paiement remboursé." : "Rétractation enregistrée.";
    });
  };

  const onRefuse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    if (!window.confirm("Refuser cette demande ? Le motif sera communiqué au commerçant par e-mail. Cette décision est définitive.")) return;
    void run(async () => {
      const result = await refuseContract({
        contractId: selected.id,
        expectedVersion: selected.data.state_version || 0,
        motif: String(form.get("motif")) as RefusalMotif,
        detail: String(form.get("detail") || "") || undefined,
        internalNote: String(form.get("internalNote") || "") || undefined,
      });
      return result.notified ? "Demande refusée ; e-mail envoyé." : "Demande refusée ; l'e-mail n'est pas parti : prévenez le commerçant.";
    });
  };

  const c = selected?.data;
  const checks = internal?.verification?.checks;

  return (
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto grid max-w-[1440px] gap-6">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1a1a1a]">Souscriptions</h1>
          <p className="mt-1 text-[14px] text-[#666]">
            Chaque demande est vérifiée à la main et confirmée ou refusée dans un délai maximal de deux jours ouvrés
            (CGV V2.1, art. 4.1). Aucune validation tacite, aucun refus automatique. Un abonnement par enseigne.
          </p>
        </div>
        <MerchantContractsConfigPanel />
        <MailOutboxPanel />
        <div className="flex gap-2">
          {Object.entries(CONTRACT_STATE_LABELS).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setState(value)}
              className={`rounded-full px-3 py-1 text-[13px] ${state === value ? "bg-[#2B285F] text-white" : "bg-white text-[#1a1a1a]"}`}>
              {label}
            </button>
          ))}
        </div>
        {message ? <p className="rounded-lg bg-[#EAF3DE] px-4 py-3 text-[14px] text-[#3B6D11]">{message}</p> : null}
        {error ? <p className="rounded-lg bg-[#FCEBEB] px-4 py-3 text-[14px] text-[#A32D2D]">{error}</p> : null}

        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <ul className="grid content-start gap-2">
            {items.length === 0 ? <li className="text-[14px] text-[#666]">Aucune demande.</li> : null}
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => void open(item)}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-[14px] ${selected?.id === item.id ? "border-[#2B285F] bg-white" : "border-[#E5E5E0] bg-white"}`}>
                  <span className="block font-medium">{item.data.enseigne_name || item.data.enseigne_request?.name || item.id}</span>
                  <span className="block text-[12px] text-[#666]">
                    {item.data.offer?.label} · {item.data.origin?.type === "demarchee" ? "démarchée" : "spontanée"} · reçue le {dateLabel(item.data.submitted_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected && c ? (
            <div className="grid content-start gap-4">
              <div className={cardClass}>
                <h2 className="text-[16px] font-medium">Demande {selected.id} — version {c.state_version}</h2>
                <dl className="grid grid-cols-[180px_minmax(0,1fr)] gap-x-4 gap-y-1 text-[14px]">
                  <dt>Compte</dt><dd>{c.owner_email} ({c.owner_uid})</dd>
                  <dt>Enseigne</dt><dd>{c.enseigne_id ? `${c.enseigne_name} (${c.enseigne_id})` : `Nouvelle : ${c.enseigne_request?.name}, ${c.enseigne_request?.address}, ${c.enseigne_request?.postal_code} ${c.enseigne_request?.city}`}</dd>
                  <dt>Entreprise</dt><dd>{c.raison_sociale} · SIRET {c.siret}</dd>
                  <dt>Offre</dt><dd>{c.offer?.label} · 1re année {formatCents(c.offer?.first_year_ht_cents)} HT ({formatCents(c.offer?.first_year_ttc_cents)} TTC){c.promo?.code ? ` · code ${c.promo.code}` : ""}</dd>
                  <dt>Origine</dt><dd>{c.origin?.type} · preuves : {(internal?.origin_evidence?.sources || []).join(", ") || "aucune"}</dd>
                  <dt>CGV acceptées</dt><dd>version {c.cgv?.version} · IP {internal?.acceptance?.ip || "—"}</dd>
                  <dt>Reçue le</dt><dd>{dateLabel(c.submitted_at)}</dd>
                  <dt>Abonnement</dt><dd>{mirror?.stripeSubscriptionId ?
                    `${mirror.status} · échéance ${mirror.currentPeriodEnd?.toLocaleDateString("fr-FR") || "—"}${mirror.cancelAtPeriodEnd ? " · renouvellement désactivé" : ""}${mirror.graceUntil ? ` · grâce jusqu'au ${mirror.graceUntil.toLocaleDateString("fr-FR")}` : ""}` : "—"}</dd>
                  <dt>Remboursements</dt><dd>{(internal?.refunds || []).map((r) => `${formatCents(r.amount)} (${r.reason})`).join(" · ") || "—"}{(internal?.late_payments || []).length ? ` · ${internal?.late_payments?.length} paiement(s) non attendu(s)` : ""}</dd>
                  <dt>Alertes</dt><dd>{alertLabel(internal?.alerts)}</dd>
                  <dt>E-mails</dt><dd>{Object.entries(internal?.emails || {}).map(([key, value]) => `${key} : ${value.error ? `échec (${value.error})` : "envoyé"}`).join(" · ") || "—"}</dd>
                </dl>
              </div>

              <div className={cardClass}>
                <div className="flex items-center justify-between">
                  <h2 className="text-[16px] font-medium">Doublon d&apos;enseigne (contrôle manuel)</h2>
                  <button type="button" className={buttonClass} disabled={busy}
                    onClick={() => void findSimilarEnseignes(selected.id).then(setSimilar).catch((err) => setError(errorText(err)))}>
                    Rechercher
                  </button>
                </div>
                {similar ? (
                  <ul className="grid gap-1 text-[14px]">
                    {similar.enseignes.map((e) => (
                      <li key={e.id}>{e.name} — {e.postalCode} {e.city} ({e.id}){e.ownedByRequester ? " · au demandeur" : ""}{e.samePlace ? " · même fiche Google" : ""}</li>
                    ))}
                    {similar.contractsWithSameSiret.map((other) => (
                      <li key={other.id}>Même SIRET : demande {other.id} ({other.state}) {other.enseigneName || ""}</li>
                    ))}
                    {!similar.enseignes.length && !similar.contractsWithSameSiret.length ? <li>Aucune enseigne proche.</li> : null}
                  </ul>
                ) : null}
              </div>

              {canSendPaymentInvitation(c.state, (c.withdrawal_deadline as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null) ? (
                <div className={cardClass}>
                  <h2 className="text-[16px] font-medium">Invitation à payer</h2>
                  <p className="text-[13px] text-[#666]">
                    {c.state === "withdrawal_pending" ? "Délai de rétractation expiré : l'invitation peut partir." :
                      `Lien valable jusqu'au ${dateLabel(c.payment_link_expires_at as { toDate: () => Date } | undefined)}.`}
                  </p>
                  <button type="button" className={buttonClass} disabled={busy} onClick={onSendInvitation}>
                    {c.state === "payment_invited" ? "Renvoyer l'invitation" : "Envoyer l'invitation"}
                  </button>
                </div>
              ) : null}

              {canRecordWithdrawal(c.state, c.origin?.type) ? (
                <form className={cardClass} onSubmit={onWithdrawal}>
                  <h2 className="text-[16px] font-medium">Rétractation reçue par e-mail ou courrier (art. 7.3)</h2>
                  <p className="text-[13px] text-[#666]">
                    La date d&apos;envoi fait foi. Délai : jusqu&apos;au {dateLabel(c.withdrawal_deadline as { toDate: () => Date } | undefined)}.
                  </p>
                  <select className={inputClass} name="channel" defaultValue="email">
                    <option value="email">E-mail</option>
                    <option value="courrier">Courrier</option>
                  </select>
                  <label className="grid gap-1 text-[13px]">Date d&apos;envoi<input className={inputClass} name="sentAt" type="date" required /></label>
                  <label className="grid gap-1 text-[13px]">Date de réception<input className={inputClass} name="receivedAt" type="date" /></label>
                  <input className={inputClass} name="reference" required placeholder="Référence de la pièce (objet du mail, n° de lettre)" />
                  <input className={inputClass} name="lateReason" placeholder="Seulement après le délai : motif de prolongation légale (L221-20)" />
                  <button className={dangerClass} disabled={busy} type="submit">Enregistrer la rétractation</button>
                </form>
              ) : null}

              {c.state === "submitted" ? (
                <>
                  <form className={cardClass} onSubmit={onChecks}>
                    <h2 className="text-[16px] font-medium">Contrôles avant confirmation</h2>
                    {CHECKS.map((check) => (
                      <div key={check.id} className="grid gap-2 md:grid-cols-[200px_160px_minmax(0,1fr)]">
                        <span className="text-[14px]" title={check.hint}>{check.label}</span>
                        <select className={inputClass} name={`result-${check.id}`} defaultValue={checks?.[check.id]?.result || ""}>
                          <option value="">—</option>
                          {Object.entries(CHECK_RESULT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <input className={inputClass} name={`note-${check.id}`} defaultValue={checks?.[check.id]?.note || ""} placeholder={check.hint} />
                      </div>
                    ))}
                    <label className="grid gap-1 text-[14px]">
                      Enseigne rattachée (créée avec l&apos;outil existant, au nom du demandeur)
                      <input className={inputClass} name="enseigneId" defaultValue={c.enseigne_id || ""} placeholder="Identifiant de l'enseigne" />
                    </label>
                    <p className="text-[13px] text-[#666]">
                      {blockingChecks(checks).length ? `Avant confirmation, il manque : ${blockingChecks(checks).join(", ")}.` : "Les 8 contrôles sont conformes."}
                    </p>
                    <button className={buttonClass} disabled={busy} type="submit">Enregistrer les contrôles</button>
                  </form>

                  <div className={cardClass}>
                    <h2 className="text-[16px] font-medium">Confirmer la souscription</h2>
                    <p className="text-[13px] text-[#666]">
                      Le contrat est conclu à l&apos;envoi de la confirmation (CGV jointes). Aucun paiement n&apos;est demandé à cette étape.
                    </p>
                    <button type="button" className={buttonClass} onClick={onConfirm}
                      disabled={busy || blockingChecks(checks).length > 0 || !c.enseigne_id}>
                      Confirmer et envoyer la confirmation
                    </button>
                    {!c.enseigne_id ? <p className="text-[13px] text-[#A32D2D]">Rattachez d&apos;abord l&apos;enseigne du demandeur.</p> : null}
                  </div>

                  <form className={cardClass} onSubmit={onRefuse}>
                    <h2 className="text-[16px] font-medium">Refuser (avant confirmation uniquement)</h2>
                    <select className={inputClass} name="motif" required defaultValue="">
                      <option value="" disabled>Motif communiqué (art. 4.1)</option>
                      {Object.entries(REFUSAL_MOTIFS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input className={inputClass} name="detail" maxLength={300} placeholder="Précision communiquée au commerçant (facultatif)" />
                    <textarea className={inputClass} name="internalNote" maxLength={1000} placeholder="Note interne (jamais communiquée)" />
                    <button className={dangerClass} disabled={busy} type="submit">Refuser la demande</button>
                  </form>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
