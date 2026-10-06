import { httpsCallable } from "firebase/functions";
import { collection, doc, getDoc, getDocs, query, where, type Timestamp } from "firebase/firestore";
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
  merchantUserId: string;
  merchantLabel: string;
  enseigneNames: string[];
  offerId: string | null;
  subscriptionStatus: MerchantSubscriptionStatus | "aucun_abonnement";
  currentPeriodEndLabel: string | null;
  cancelAtPeriodEnd: boolean;
  hasReferral: boolean;
  customOfferAmountHtLabel: string | null;
  customOfferLabel: string | null;
};

export type MerchantReferralStatus =
  | "linked"
  | "eligible"
  | "approved"
  | "paid"
  | "rejected"
  | "cancelled";

export type AdminMerchantReferralItem = {
  merchantUserId: string;
  merchantLabel: string;
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

async function getUserLabelsByIds(ids: Iterable<string>) {
  const uniqueIds = [...new Set([...ids].filter(Boolean))];
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

async function getEnseigneNamesByOwner(merchantUserId: string): Promise<string[]> {
  const ownerRef = doc(db, "users", merchantUserId);
  const [byOwner, byOwnerId] = await Promise.all([
    getDocs(query(collection(db, "enseignes"), where("owner", "==", ownerRef))),
    getDocs(query(collection(db, "enseignes"), where("owner_id", "==", ownerRef))),
  ]);
  const namesById = new Map<string, string>();
  [...byOwner.docs, ...byOwnerId.docs].forEach((d) => {
    namesById.set(d.id, (d.data().name as string | undefined) || d.id);
  });
  return [...namesById.values()];
}

function pathToUid(path: string | null | undefined): string | null {
  return path ? path.replace(/^users\//, "") : null;
}

export async function getMerchantSubscriptionsOverview(): Promise<AdminMerchantSubscriptionItem[]> {
  const [subscriptionsSnap, referralsSnap, customOffersSnap] = await Promise.all([
    getDocs(collection(db, "merchant_subscriptions")),
    getDocs(collection(db, "merchant_referrals")),
    getDocs(collection(db, "merchant_custom_offers")),
  ]);
  const merchantUserIdsWithReferral = new Set(referralsSnap.docs.map((d) => d.id));
  const customOffersById = new Map(customOffersSnap.docs.map((d) => [d.id, d.data()]));

  // Union : un commercant avec un tarif negocie mais pas encore d'abonnement
  // reste visible (l'Admin doit pouvoir suivre qu'il attend de payer).
  const allMerchantUserIds = new Set([
    ...subscriptionsSnap.docs.map((d) => d.id),
    ...customOffersById.keys(),
  ]);
  const subscriptionsById = new Map(subscriptionsSnap.docs.map((d) => [d.id, d.data()]));

  const merchantLabelsById = await getUserLabelsByIds(allMerchantUserIds);

  return Promise.all([...allMerchantUserIds].map(async (merchantUserId) => {
    const subscription = subscriptionsById.get(merchantUserId);
    const customOffer = customOffersById.get(merchantUserId);
    const enseigneNames = await getEnseigneNamesByOwner(merchantUserId);
    return {
      merchantUserId,
      merchantLabel: merchantLabelsById.get(merchantUserId) || merchantUserId,
      enseigneNames,
      offerId: (subscription?.offer_id as string | undefined) || null,
      subscriptionStatus: (subscription?.subscription_status as string | undefined) || "aucun_abonnement",
      currentPeriodEndLabel: formatTimestamp(subscription?.current_period_end as Timestamp | undefined),
      cancelAtPeriodEnd: subscription?.cancel_at_period_end === true,
      hasReferral: merchantUserIdsWithReferral.has(merchantUserId),
      customOfferAmountHtLabel: formatCents(customOffer?.amount_ht_cents as number | undefined),
      customOfferLabel: (customOffer?.label as string | undefined) || null,
    };
  }));
}

export async function getMerchantReferralsOverview(): Promise<AdminMerchantReferralItem[]> {
  const referralsSnap = await getDocs(collection(db, "merchant_referrals"));
  const docs = referralsSnap.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() }));

  const labelsById = await getUserLabelsByIds([
    ...docs.map((d) => d.id),
    ...docs.map((d) => pathToUid((d.data.inviter_user_id as { path?: string } | undefined)?.path)).filter(Boolean) as string[],
  ]);

  return docs.map(({ id, data }) => {
    const inviterId = pathToUid((data.inviter_user_id as { path?: string } | undefined)?.path);
    return {
      merchantUserId: id,
      merchantLabel: labelsById.get(id) || id,
      inviterUserId: inviterId,
      inviterLabel: inviterId ? labelsById.get(inviterId) || inviterId : "—",
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

export async function approveMerchantReferral(merchantUserId: string) {
  const callable = httpsCallable<{ merchantUserId: string }, { status: string }>(
    canonicalFunctionsClient,
    "adminApproveMerchantReferral",
  );
  await callable({ merchantUserId });
}

export async function rejectMerchantReferral(merchantUserId: string, reason: string) {
  const callable = httpsCallable<{ merchantUserId: string; reason: string }, { status: string }>(
    canonicalFunctionsClient,
    "adminRejectMerchantReferral",
  );
  await callable({ merchantUserId, reason });
}

export async function markMerchantReferralPaid(merchantUserId: string, paidReference: string) {
  const callable = httpsCallable<{ merchantUserId: string; paidReference: string }, { status: string }>(
    canonicalFunctionsClient,
    "adminMarkMerchantReferralPaid",
  );
  await callable({ merchantUserId, paidReference });
}

export async function setMerchantCustomOffer(merchantUserId: string, amountHtCents: number, label: string) {
  const callable = httpsCallable<
    { merchantUserId: string; amountHtCents: number; label: string },
    { status: string }
  >(canonicalFunctionsClient, "adminSetMerchantCustomOffer");
  await callable({ merchantUserId, amountHtCents, label });
}

export async function removeMerchantCustomOffer(merchantUserId: string) {
  const callable = httpsCallable<
    { merchantUserId: string; amountHtCents: null },
    { status: string }
  >(canonicalFunctionsClient, "adminSetMerchantCustomOffer");
  await callable({ merchantUserId, amountHtCents: null });
}
