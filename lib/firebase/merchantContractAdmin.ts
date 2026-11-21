// Parcours de souscription V2.1 : appels de la console vers le backend
// canonique (Functions us-central1). Lectures Firestore autorisees a l'admin
// par les regles ; toutes les ecritures passent par les Functions.
import { httpsCallable } from "firebase/functions";
import { collection, doc, getDoc, getDocs, limit, query, where, type Timestamp } from "firebase/firestore";
import { db } from "./client-app";
import { canonicalFunctionsClient } from "./functions";
import type { CheckRecord, PromoCodePayload, RefusalMotif } from "@/lib/admin/merchantContracts";

export type SalesRep = { id: string; name: string; email: string | null; active: boolean };

export type PromoCodeItem = {
  code: string;
  kind: string;
  value: number | null;
  value_cents: number | null;
  offers: string[];
  validUntil: Date | null;
  maxUses: number | null;
  uses: number;
  repId: string | null;
  active: boolean;
};

function call<I, O>(name: string) {
  return httpsCallable<I, O>(canonicalFunctionsClient, name);
}

export async function listSalesReps(): Promise<SalesRep[]> {
  const snap = await getDocs(collection(db, "sales_reps"));
  return snap.docs.map((d) => ({
    id: d.id,
    name: (d.data().name as string) || d.id,
    email: (d.data().email as string | null) || null,
    active: d.data().active !== false,
  })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function listPromoCodes(): Promise<PromoCodeItem[]> {
  const snap = await getDocs(collection(db, "promo_codes"));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      code: d.id,
      kind: (data.kind as string) || "",
      value: (data.value as number | null) ?? null,
      value_cents: (data.value_cents as number | null) ?? null,
      offers: (data.offers as string[]) || [],
      validUntil: (data.valid_until as Timestamp | null)?.toDate() || null,
      maxUses: (data.max_uses as number | null) ?? null,
      uses: (data.uses as number) || 0,
      repId: (data.rep_id as string | null) || null,
      active: data.active === true,
    };
  }).sort((a, b) => a.code.localeCompare(b.code));
}

export async function upsertSalesRep(input: { repId?: string; name: string; email?: string; active: boolean }) {
  const { data } = await call<typeof input, { repId: string }>("adminUpsertSalesRep")(input);
  return data.repId;
}

export async function createRepLink(input: { repId: string; enseigneName?: string; siret?: string; sentAt?: string }) {
  const { data } = await call<typeof input, { token: string; path: string }>("adminCreateRepLink")(input);
  return data;
}

export async function upsertPromoCode(payload: PromoCodePayload) {
  await call<PromoCodePayload, { code: string }>("adminUpsertPromoCode")(payload);
}

// ---- lot 1.2-min : file de verification

export type AdminContract = {
  id: string;
  data: Record<string, unknown> & {
    state?: string;
    state_version?: number;
    owner_uid?: string;
    owner_email?: string;
    enseigne_id?: string | null;
    enseigne_name?: string | null;
    enseigne_request?: { name: string; address: string; postal_code: string; city: string } | null;
    siret?: string;
    raison_sociale?: string;
    offer?: { label?: string; first_year_ht_cents?: number; first_year_ttc_cents?: number; discount_ht_cents?: number };
    promo?: { code?: string } | null;
    origin?: { type?: string };
    cgv?: { version?: string };
    submitted_at?: Timestamp;
    confirmed_at?: Timestamp;
    refused_at?: Timestamp;
  };
};

export type AdminContractInternal = {
  acceptance?: { ip?: string | null; cgv_version?: string; cgv_sha256?: string };
  origin_evidence?: { sources?: string[]; rep_id?: string | null; code?: string | null };
  verification?: { checks?: Record<string, CheckRecord & { by?: string }>; reviewer_uid?: string };
  alerts?: Record<string, unknown>;
  emails?: Record<string, { sent_at?: Timestamp; failed_at?: Timestamp; error?: string }>;
  refusal_reason?: string | null;
  // Tranche 2a
  refunds?: { invoice_id: string; refund_id?: string; credit_note_id?: string; amount: number; reason: string }[];
  late_payments?: { subscription_id: string; state_at_payment: string }[];
};

export async function listContracts(state: string): Promise<AdminContract[]> {
  const snap = await getDocs(query(collection(db, "merchant_contracts"), where("state", "==", state), limit(200)));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as AdminContract["data"] }))
    .sort((a, b) => (a.data.submitted_at?.toMillis() || 0) - (b.data.submitted_at?.toMillis() || 0));
}

export async function getContractInternal(contractId: string): Promise<AdminContractInternal> {
  const snap = await getDoc(doc(db, "merchant_contracts", contractId, "internal", "record"));
  return (snap.exists() ? snap.data() : {}) as AdminContractInternal;
}

export async function recordChecks(input: {
  contractId: string; expectedVersion: number; checks: Partial<Record<string, CheckRecord>>; enseigneId?: string;
}) {
  const { data } = await call<typeof input, { stateVersion: number }>("adminRecordMerchantContractChecks")(input);
  return data.stateVersion;
}

export async function refuseContract(input: {
  contractId: string; expectedVersion: number; motif: RefusalMotif; detail?: string; internalNote?: string;
}) {
  const { data } = await call<typeof input, { state: string; notified: boolean }>("adminRefuseMerchantContract")(input);
  return data;
}

export type SimilarEnseignes = {
  enseignes: { id: string; name: string; city: string; postalCode: string; ownedByRequester: boolean; samePlace: boolean }[];
  contractsWithSameSiret: { id: string; state: string; enseigneName: string | null; ownerUid: string }[];
};

export async function findSimilarEnseignes(contractId: string) {
  const { data } = await call<{ contractId: string }, SimilarEnseignes>("adminFindSimilarEnseignes")({ contractId });
  return data;
}

// ---- lot 1.4 : confirmation de souscription (le contrat est conclu a l'envoi)
export async function confirmContract(input: { contractId: string; expectedVersion: number }) {
  const { data } = await call<typeof input, { state: string; confirmedAt: number }>("adminConfirmMerchantContract")(input);
  return data;
}

// ---- configuration du parcours
export type ContractsConfig = {
  enabled: boolean;
  cgv: { version: string; sha256: string; storage_path: string; url: string; effective_date: string } | null;
  adminAlertEmail: string | null;
};

export async function getContractsConfig(): Promise<ContractsConfig> {
  const snap = await getDoc(doc(db, "app_config", "merchant_contracts"));
  const data = snap.exists() ? snap.data() : {};
  return {
    enabled: data.enabled === true,
    cgv: (data.cgv as ContractsConfig["cgv"]) || null,
    adminAlertEmail: (data.admin_alert_email as string | null) || null,
  };
}

export async function updateContractsConfig(payload: Record<string, unknown>) {
  const { data } = await call<Record<string, unknown>, { enabled: boolean }>("adminUpdateMerchantContractsConfig")(payload);
  return data;
}

// ---- tranche 2a, lot 1.6 : invitation a payer, file de reprise des e-mails
export async function sendPaymentInvitation(contractId: string) {
  const { data } = await call<{ contractId: string }, { sent: boolean; queued: boolean }>("adminSendPaymentInvitation")({ contractId });
  return data;
}

export type OutboxItem = { id: string; key: string; kind: string; status: string; attempts: number; lastError: string | null; contractId: string | null };
export type AdminAlert = { id: string; kind: string; detail: string; contractId: string | null; createdAt: Date | null };

export async function listMailOutbox(): Promise<OutboxItem[]> {
  const snap = await getDocs(query(collection(db, "mail_outbox"), where("status", "in", ["pending", "failed"]), limit(100)));
  return snap.docs.map((d) => ({
    id: d.id, key: (d.data().key as string) || "", kind: (d.data().kind as string) || "", status: (d.data().status as string) || "",
    attempts: (d.data().attempts as number) || 0, lastError: (d.data().last_error as string) || null,
    contractId: (d.data().contract_id as string) || null,
  }));
}

export async function listOpenAlerts(): Promise<AdminAlert[]> {
  const snap = await getDocs(query(collection(db, "admin_alerts"), where("resolved", "==", false), limit(100)));
  return snap.docs.map((d) => ({
    id: d.id, kind: (d.data().kind as string) || "", detail: (d.data().detail as string) || "",
    contractId: (d.data().contract_id as string) || null, createdAt: (d.data().created_at as Timestamp | undefined)?.toDate() || null,
  }));
}

export async function retryMailOutbox(outboxId: string) {
  await call<{ outboxId: string }, unknown>("adminRetryMailOutbox")({ outboxId });
}
export async function abandonMailOutbox(outboxId: string) {
  await call<{ outboxId: string }, unknown>("adminAbandonMailOutbox")({ outboxId });
}
export async function resolveAlert(alertId: string) {
  await call<{ alertId: string }, unknown>("adminResolveAlert")({ alertId });
}

// ---- tranche 2a, lot 1.8 : miroir de l'abonnement de l'enseigne
export type EnseigneSubscription = {
  status: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  graceUntil: Date | null;
  stripeSubscriptionId: string | null;
};

export async function getEnseigneSubscription(enseigneId: string): Promise<EnseigneSubscription | null> {
  const snap = await getDoc(doc(db, "enseigne_subscriptions", enseigneId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    status: (data.status as string) || null,
    currentPeriodEnd: (data.current_period_end as Timestamp | null)?.toDate() || null,
    cancelAtPeriodEnd: data.cancel_at_period_end === true,
    graceUntil: (data.grace_until as Timestamp | null)?.toDate() || null,
    stripeSubscriptionId: (data.stripe_subscription_id as string) || null,
  };
}

// ---- tranche 2a, lot 1.5 : retractation recue par e-mail ou courrier (date d'envoi)
export async function recordWithdrawal(input: {
  contractId: string; channel: "email" | "courrier"; sentAt: string; receivedAt?: string; reference: string; lateReason?: string;
}) {
  const { data } = await call<typeof input, { state: string; refunded?: number }>("adminRecordWithdrawal")(input);
  return data;
}
