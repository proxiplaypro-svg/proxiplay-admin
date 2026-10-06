import { httpsCallable } from "firebase/functions";
import { collection, doc, getDoc, getDocs, type Timestamp } from "firebase/firestore";
import { db } from "./client-app";
import { canonicalFunctionsClient } from "./functions";

export type MerchantSubscriptionStatus =
  | "incomplete"
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | string;

export type AdminMerchantSubscriptionItem = {
  enseigneId: string;
  enseigneName: string;
  offerId: string | null;
  subscriptionStatus: MerchantSubscriptionStatus;
  currentPeriodEndLabel: string | null;
  cancelAtPeriodEnd: boolean;
  hasReferral: boolean;
  createdAtLabel: string | null;
};

export type MerchantReferralStatus =
  | "linked"
  | "eligible"
  | "approved"
  | "paid"
  | "rejected"
  | "cancelled";

export type AdminMerchantReferralItem = {
  enseigneId: string;
  enseigneName: string;
  inviterUserId: string | null;
  inviterLabel: string;
  code: string | null;
  status: MerchantReferralStatus;
  linkedAtLabel: string | null;
  subscriptionAmountHtLabel: string | null;
  rejectedReason: string | null;
  paidAtLabel: string | null;
  paidReference: string | null;
};

function formatTimestamp(value: Timestamp | null | undefined): string | null {
  if (!value) return null;
  try {
    return value.toDate().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return null;
  }
}

function formatCents(value: number | null | undefined): string | null {
  if (typeof value !== "number") return null;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value / 100);
}

async function getEnseigneNamesByIds(ids: Iterable<string>) {
  const uniqueIds = [...new Set([...ids].filter(Boolean))];
  const snapshots = await Promise.all(uniqueIds.map((id) => getDoc(doc(db, "enseignes", id))));
  const namesById = new Map<string, string>();
  snapshots.forEach((snapshot) => {
    if (snapshot.exists()) {
      namesById.set(snapshot.id, (snapshot.data().name as string | undefined) || snapshot.id);
    }
  });
  return namesById;
}

async function getUserLabelsByPaths(paths: Iterable<string | null | undefined>) {
  const uniqueIds = [...new Set([...paths].filter(Boolean).map((p) => (p as string).replace(/^users\//, "")))];
  const snapshots = await Promise.all(uniqueIds.map((id) => getDoc(doc(db, "users", id))));
  const labelsById = new Map<string, string>();
  snapshots.forEach((snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data() as { email?: string; displayName?: string };
      labelsById.set(snapshot.id, data.displayName || data.email || snapshot.id);
    }
  });
  return labelsById;
}

export async function getMerchantSubscriptionsOverview(): Promise<AdminMerchantSubscriptionItem[]> {
  const [subscriptionsSnap, referralsSnap] = await Promise.all([
    getDocs(collection(db, "merchant_subscriptions")),
    getDocs(collection(db, "merchant_referrals")),
  ]);
  const enseigneIdsWithReferral = new Set(referralsSnap.docs.map((d) => d.id));
  const enseigneNamesById = await getEnseigneNamesByIds(subscriptionsSnap.docs.map((d) => d.id));

  return subscriptionsSnap.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      enseigneId: snapshot.id,
      enseigneName: enseigneNamesById.get(snapshot.id) || snapshot.id,
      offerId: (data.offer_id as string | undefined) || null,
      subscriptionStatus: (data.subscription_status as string | undefined) || "incomplete",
      currentPeriodEndLabel: formatTimestamp(data.current_period_end as Timestamp | undefined),
      cancelAtPeriodEnd: data.cancel_at_period_end === true,
      hasReferral: enseigneIdsWithReferral.has(snapshot.id),
      createdAtLabel: formatTimestamp(data.created_at as Timestamp | undefined),
    };
  });
}

export async function getMerchantReferralsOverview(): Promise<AdminMerchantReferralItem[]> {
  const referralsSnap = await getDocs(collection(db, "merchant_referrals"));
  const docs = referralsSnap.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() }));

  const [enseigneNamesById, inviterLabelsById] = await Promise.all([
    getEnseigneNamesByIds(docs.map((d) => d.id)),
    getUserLabelsByPaths(docs.map((d) => (d.data.inviter_user_id as { path?: string } | undefined)?.path)),
  ]);

  return docs.map(({ id, data }) => {
    const inviterPath = (data.inviter_user_id as { path?: string } | undefined)?.path || null;
    const inviterId = inviterPath ? inviterPath.replace(/^users\//, "") : null;
    return {
      enseigneId: id,
      enseigneName: enseigneNamesById.get(id) || id,
      inviterUserId: inviterId,
      inviterLabel: inviterId ? inviterLabelsById.get(inviterId) || inviterId : "—",
      code: (data.code as string | undefined) || null,
      status: (data.status as AdminMerchantReferralItem["status"]) || "linked",
      linkedAtLabel: formatTimestamp(data.linked_at as Timestamp | undefined),
      subscriptionAmountHtLabel: formatCents(data.subscription_amount_ht_cents as number | undefined),
      rejectedReason: (data.rejected_reason as string | undefined) || null,
      paidAtLabel: formatTimestamp(data.paid_at as Timestamp | undefined),
      paidReference: (data.paid_reference as string | undefined) || null,
    };
  });
}

export async function approveMerchantReferral(enseigneId: string) {
  const callable = httpsCallable<{ enseigneId: string }, { status: string }>(
    canonicalFunctionsClient,
    "adminApproveMerchantReferral",
  );
  await callable({ enseigneId });
}

export async function rejectMerchantReferral(enseigneId: string, reason: string) {
  const callable = httpsCallable<{ enseigneId: string; reason: string }, { status: string }>(
    canonicalFunctionsClient,
    "adminRejectMerchantReferral",
  );
  await callable({ enseigneId, reason });
}

export async function markMerchantReferralPaid(enseigneId: string, paidReference: string) {
  const callable = httpsCallable<{ enseigneId: string; paidReference: string }, { status: string }>(
    canonicalFunctionsClient,
    "adminMarkMerchantReferralPaid",
  );
  await callable({ enseigneId, paidReference });
}
