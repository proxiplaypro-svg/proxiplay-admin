// Gestion des campagnes QR cote serveur (routes /api/admin/qr-campaigns,
// reservees aux administrateurs). Chaque ecriture met a jour, dans la meme
// transaction, la campagne et sa fiche de chemin (lue par la redirection),
// et journalise les changements de nom, statut, destination et lancement.

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  QR_CAMPAIGNS_COLLECTION,
  QR_CAMPAIGN_CHANGES_SUBCOLLECTION,
  QR_CAMPAIGN_SLUGS_COLLECTION,
  QR_HOURLY_STATS_SUBCOLLECTION,
  aggregateQrStats,
  isQrCampaignChannel,
  isQrCampaignStatus,
  isValidQrCampaignId,
  listDayKeys,
  parseParisDateTimeInput,
  qrPublicUrl,
  validateQrDestination,
  validateQrSlug,
  type QrCampaignChannel,
  type QrCampaignStats,
  type QrCampaignStatus,
  type QrHourlyStatsDoc,
} from "@/lib/admin/qrCampaigns";

export type QrCampaignView = {
  id: string;
  name: string;
  slug: string;
  publicUrl: string;
  destinationUrl: string;
  status: QrCampaignStatus;
  channel: QrCampaignChannel;
  launchAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: string;
};

export class QrCampaignError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const NAME_MAX = 80;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function iso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

export function toQrCampaignView(id: string, data: Record<string, unknown>): QrCampaignView {
  const slug = text(data.slug);
  return {
    id,
    name: text(data.name),
    slug,
    publicUrl: slug ? qrPublicUrl(slug) : "",
    destinationUrl: text(data.destination_url),
    status: isQrCampaignStatus(data.status) ? data.status : "draft",
    channel: isQrCampaignChannel(data.channel) ? data.channel : "autre",
    launchAt: iso(data.launch_at),
    createdAt: iso(data.created_at),
    updatedAt: iso(data.updated_at),
    updatedBy: text(data.updated_by),
  };
}

function readName(value: unknown): string {
  const name = text(value).replace(/\s+/g, " ");
  if (!name || name.length > NAME_MAX) throw new QrCampaignError(400, `Nom obligatoire (${NAME_MAX} caractères au plus).`);
  return name;
}

function readDestination(value: unknown): string {
  const error = validateQrDestination(value);
  if (error) throw new QrCampaignError(400, error);
  return text(value);
}

function readLaunchAt(value: unknown): Timestamp | null {
  if (value === null || value === "") return null;
  const date = parseParisDateTimeInput(value);
  if (!date) throw new QrCampaignError(400, "Date de lancement invalide (AAAA-MM-JJTHH:MM, heure de Paris).");
  return Timestamp.fromDate(date);
}

export async function listQrCampaigns(db: Firestore): Promise<QrCampaignView[]> {
  const snapshot = await db.collection(QR_CAMPAIGNS_COLLECTION).orderBy("created_at", "desc").limit(200).get();
  return snapshot.docs.map((doc) => toQrCampaignView(doc.id, doc.data()));
}

export async function getQrCampaign(db: Firestore, id: string): Promise<QrCampaignView> {
  if (!isValidQrCampaignId(id)) throw new QrCampaignError(404, "Campagne introuvable.");
  const snapshot = await db.collection(QR_CAMPAIGNS_COLLECTION).doc(id).get();
  if (!snapshot.exists) throw new QrCampaignError(404, "Campagne introuvable.");
  return toQrCampaignView(snapshot.id, snapshot.data() ?? {});
}

export async function createQrCampaign(db: Firestore, body: Record<string, unknown>, actor: string): Promise<QrCampaignView> {
  const id = text(body.id);
  if (!isValidQrCampaignId(id)) {
    throw new QrCampaignError(400, "Identifiant invalide : minuscules, chiffres et _, 3 à 40 caractères (ex. bus_dunkerque).");
  }
  const slug = text(body.slug).toLowerCase();
  const slugError = validateQrSlug(slug);
  if (slugError) throw new QrCampaignError(400, slugError);
  const name = readName(body.name);
  const destination = readDestination(body.destinationUrl);
  const channel = isQrCampaignChannel(body.channel) ? body.channel : "autre";
  // Une campagne est toujours creee « a preparer » : l'activation est un
  // geste distinct, apres verification.
  const status: QrCampaignStatus = "draft";
  const launchAt = readLaunchAt(body.launchAt ?? null);

  const campaignRef = db.collection(QR_CAMPAIGNS_COLLECTION).doc(id);
  const slugRef = db.collection(QR_CAMPAIGN_SLUGS_COLLECTION).doc(slug);
  await db.runTransaction(async (tx) => {
    const [campaign, slugDoc] = await Promise.all([tx.get(campaignRef), tx.get(slugRef)]);
    if (campaign.exists) throw new QrCampaignError(409, "Une campagne utilise déjà cet identifiant.");
    if (slugDoc.exists) throw new QrCampaignError(409, "Ce chemin est déjà utilisé par une autre campagne.");
    const now = FieldValue.serverTimestamp();
    tx.create(campaignRef, {
      name, slug, destination_url: destination, status, channel, launch_at: launchAt,
      created_at: now, created_by: actor, updated_at: now, updated_by: actor,
    });
    tx.create(slugRef, { campaign_id: id, destination_url: destination, status, launch_at: launchAt, updated_at: now });
    tx.create(campaignRef.collection(QR_CAMPAIGN_CHANGES_SUBCOLLECTION).doc(), {
      at: now, by: actor, kind: "created", changes: { name, slug, destination_url: destination, status, channel },
    });
  });
  return getQrCampaign(db, id);
}

/** Le chemin (donc l'URL du QR code) ne change jamais. */
export async function updateQrCampaign(db: Firestore, id: string, body: Record<string, unknown>, actor: string): Promise<QrCampaignView> {
  if (!isValidQrCampaignId(id)) throw new QrCampaignError(404, "Campagne introuvable.");
  if (body.slug !== undefined || body.id !== undefined) {
    throw new QrCampaignError(400, "Le chemin et l'identifiant d'une campagne ne se modifient pas.");
  }
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = readName(body.name);
  if (body.destinationUrl !== undefined) updates.destination_url = readDestination(body.destinationUrl);
  if (body.status !== undefined) {
    if (!isQrCampaignStatus(body.status)) throw new QrCampaignError(400, "Statut invalide.");
    updates.status = body.status;
  }
  if (body.channel !== undefined) {
    if (!isQrCampaignChannel(body.channel)) throw new QrCampaignError(400, "Canal invalide.");
    updates.channel = body.channel;
  }
  if (body.launchAt !== undefined) updates.launch_at = readLaunchAt(body.launchAt);
  if (!Object.keys(updates).length) throw new QrCampaignError(400, "Aucune modification.");

  const campaignRef = db.collection(QR_CAMPAIGNS_COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const campaign = await tx.get(campaignRef);
    if (!campaign.exists) throw new QrCampaignError(404, "Campagne introuvable.");
    const current = campaign.data() ?? {};
    const slug = text(current.slug);
    const slugRef = db.collection(QR_CAMPAIGN_SLUGS_COLLECTION).doc(slug);
    const slugDoc = await tx.get(slugRef);
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    for (const [field, value] of Object.entries(updates)) {
      const before = current[field] instanceof Timestamp ? (current[field] as Timestamp).toDate().toISOString() : current[field] ?? null;
      const after = value instanceof Timestamp ? value.toDate().toISOString() : value;
      if (before !== after) changed[field] = { from: before, to: after };
    }
    if (!Object.keys(changed).length) return;
    const now = FieldValue.serverTimestamp();
    tx.update(campaignRef, { ...updates, updated_at: now, updated_by: actor });
    const projection: Record<string, unknown> = { updated_at: now };
    for (const field of ["destination_url", "status", "launch_at"]) {
      if (field in updates) projection[field] = updates[field];
    }
    if (slugDoc.exists) tx.update(slugRef, projection);
    else {
      tx.set(slugRef, {
        campaign_id: id,
        destination_url: updates.destination_url ?? current.destination_url,
        status: updates.status ?? current.status,
        launch_at: "launch_at" in updates ? updates.launch_at : current.launch_at ?? null,
        updated_at: now,
      });
    }
    tx.create(campaignRef.collection(QR_CAMPAIGN_CHANGES_SUBCOLLECTION).doc(), { at: now, by: actor, kind: "updated", changes: changed });
  });
  return getQrCampaign(db, id);
}

export async function getQrCampaignStats(db: Firestore, id: string, from: string, to: string): Promise<QrCampaignStats> {
  if (!listDayKeys(from, to)) throw new QrCampaignError(400, "Période invalide (366 jours au plus).");
  await getQrCampaign(db, id);
  const snapshot = await db.collection(QR_CAMPAIGNS_COLLECTION).doc(id).collection(QR_HOURLY_STATS_SUBCOLLECTION)
    .where("date", ">=", from).where("date", "<=", to).get();
  const stats = aggregateQrStats(snapshot.docs.map((doc) => doc.data() as QrHourlyStatsDoc), from, to);
  if (!stats) throw new QrCampaignError(400, "Période invalide.");
  return stats;
}

export async function listQrCampaignChanges(db: Firestore, id: string) {
  const snapshot = await db.collection(QR_CAMPAIGNS_COLLECTION).doc(id).collection(QR_CAMPAIGN_CHANGES_SUBCOLLECTION)
    .orderBy("at", "desc").limit(50).get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, at: iso(data.at), by: text(data.by), kind: text(data.kind), changes: data.changes ?? {} };
  });
}

/**
 * Reponse d'erreur des routes /api/admin/qr-campaigns. Un jeton invalide ou
 * expire (erreur Firebase « auth/... ») vaut 401, jamais 500.
 */
export function qrCampaignErrorResponse(error: unknown, handleAdminAuthError: (error: unknown) => Response | null, scope: string): Response {
  const authResponse = handleAdminAuthError(error);
  if (authResponse) return authResponse;
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && code.startsWith("auth/")) {
    return Response.json({ error: "Connexion admin requise." }, { status: 401 });
  }
  if (error instanceof QrCampaignError) return Response.json({ error: error.message }, { status: error.status });
  console.error(`[${scope}]`, error instanceof Error ? error.message : error);
  return Response.json({ error: "Erreur serveur." }, { status: 500 });
}
