import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  QR_CAMPAIGNS_COLLECTION,
  QR_CAMPAIGN_SLUGS_COLLECTION,
  QR_HOURLY_STATS_SUBCOLLECTION,
  isQrCampaignStatus,
} from "@/lib/admin/qrCampaigns";
import type { QrHourlyIncrement, QrRedirectStore, QrRedirectTarget } from "@/lib/qr/qrRedirect";

/**
 * Lecture : un seul document par redirection, qr_campaign_slugs/{chemin},
 * qui recopie destination, statut et date de lancement (mis a jour dans la
 * meme transaction que la campagne). Ecriture : un seul document horaire
 * par ouverture, avec des increments atomiques.
 */
export function createFirestoreQrStore(getDb: () => Firestore): QrRedirectStore {
  return {
    async findBySlug(slug: string): Promise<QrRedirectTarget | null> {
      const snapshot = await getDb().collection(QR_CAMPAIGN_SLUGS_COLLECTION).doc(slug).get();
      if (!snapshot.exists) return null;
      const data = snapshot.data() ?? {};
      const launchAt = data.launch_at instanceof Timestamp ? data.launch_at.toDate() : null;
      return {
        campaignId: typeof data.campaign_id === "string" ? data.campaign_id : "",
        destination: typeof data.destination_url === "string" ? data.destination_url : "",
        status: isQrCampaignStatus(data.status) ? data.status : "paused",
        launchAt,
      };
    },
    async increment(update: QrHourlyIncrement): Promise<void> {
      if (!update.campaignId) return;
      const increments = Object.fromEntries(
        Object.entries(update.increments).map(([field, value]) => [field, FieldValue.increment(value ?? 0)]),
      );
      await getDb()
        .collection(QR_CAMPAIGNS_COLLECTION).doc(update.campaignId)
        .collection(QR_HOURLY_STATS_SUBCOLLECTION).doc(update.docId)
        .set({
          campaign_id: update.campaignId,
          date: update.date,
          hour: update.hour,
          shard: update.shard,
          ...increments,
          updated_at: FieldValue.serverTimestamp(),
        }, { merge: true });
    },
  };
}
