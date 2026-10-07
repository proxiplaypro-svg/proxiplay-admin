import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  adCampaignsOverlap,
  getAdCampaignStatus,
  isAdPlacement,
  type AdCampaignRecord,
  type AdPlacement,
} from "@/lib/admin/adCampaign";
import { getAdminDb } from "@/lib/firebase/admin-app";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";

const CAMPAIGNS_COLLECTION = "ad_campaigns";
const ADS_COLLECTION = "ads";

type CampaignData = {
  name: string;
  advertiser: string;
  placement: AdPlacement;
  image_url: string;
  destination_url: string;
  start_at: Timestamp | null;
  end_at: Timestamp | null;
  frequency_cap_hours: number | null;
  published: boolean;
  status: string;
  source_campaign_id: string | null;
  impressions: number;
  clicks: number;
};

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readTimestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function toDateInput(value: unknown) {
  const timestamp = readTimestamp(value);
  if (!timestamp) return "";
  const date = timestamp.toDate();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDate(value: unknown) {
  const text = readText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return Timestamp.fromDate(date);
}

function asRecord(id: string, raw: Record<string, unknown>): AdCampaignRecord {
  const published = raw.published === true;
  const record: AdCampaignRecord = {
    id,
    enabled: published,
    name: readText(raw.name),
    advertiser: readText(raw.advertiser),
    placement: isAdPlacement(raw.placement) ? raw.placement : "home_banner",
    imageUrl: readText(raw.image_url),
    destinationUrl: readText(raw.destination_url),
    startDate: toDateInput(raw.start_at),
    endDate: toDateInput(raw.end_at),
    frequencyCapHours: raw.frequency_cap_hours == null ? "" : String(raw.frequency_cap_hours),
    status: raw.status === "disabled" ? "disabled" : "draft",
    published,
    sourceCampaignId: readText(raw.source_campaign_id) || null,
    impressions: typeof raw.impressions === "number" ? raw.impressions : 0,
    clicks: typeof raw.clicks === "number" ? raw.clicks : 0,
    createdAt: readTimestamp(raw.created_at)?.toDate().toISOString() ?? null,
    updatedAt: readTimestamp(raw.updated_at)?.toDate().toISOString() ?? null,
  };
  return { ...record, status: getAdCampaignStatus(record) };
}

function parseCampaign(body: Record<string, unknown>, existing?: CampaignData): CampaignData | null {
  const placement = body.placement === undefined ? existing?.placement : body.placement;
  if (!isAdPlacement(placement)) return null;
  const startAt = body.start_date === undefined ? existing?.start_at ?? null : parseDate(body.start_date);
  const endAt = body.end_date === undefined ? existing?.end_at ?? null : parseDate(body.end_date);
  const name = body.name === undefined ? existing?.name ?? "" : readText(body.name);
  const advertiser = body.advertiser === undefined ? existing?.advertiser ?? "" : readText(body.advertiser);
  const imageUrl = body.image_url === undefined ? existing?.image_url ?? "" : readText(body.image_url);
  const destinationUrl = body.destination_url === undefined ? existing?.destination_url ?? "" : readText(body.destination_url);
  const frequency = body.frequency_cap_hours === undefined
    ? existing?.frequency_cap_hours ?? null
    : body.frequency_cap_hours === null || body.frequency_cap_hours === ""
      ? null
      : Number(body.frequency_cap_hours);

  if (!name || !advertiser || !startAt || !endAt || startAt.toMillis() >= endAt.toMillis()) return null;
  if (placement === "open" && (!Number.isInteger(frequency) || (frequency ?? -1) < 0)) return null;
  if (placement !== "open" && frequency !== null) return null;
  if (destinationUrl) {
    try {
      const destination = new URL(destinationUrl);
      if (destination.protocol !== "https:" && destination.protocol !== "http:") return null;
    } catch {
      return null;
    }
  }

  return {
    name,
    advertiser,
    placement,
    image_url: imageUrl,
    destination_url: destinationUrl,
    start_at: startAt,
    end_at: endAt,
    frequency_cap_hours: frequency,
    published: existing?.published ?? false,
    status: existing?.status ?? "draft",
    source_campaign_id: body.source_campaign_id === undefined
      ? existing?.source_campaign_id ?? null
      : readText(body.source_campaign_id) || null,
    impressions: existing?.impressions ?? 0,
    clicks: existing?.clicks ?? 0,
  };
}

function legacyStatus(data: Record<string, unknown>) {
  const record = asRecord("legacy", {
    ...data,
    placement: "home_banner",
    published: data.enabled === true,
    status: data.enabled === true ? "active" : "disabled",
  });
  return record.status;
}

async function migrateLegacyPlacements() {
  const db = getAdminDb();
  await Promise.all((["open", "home_banner"] as const).map((placement) => db.runTransaction(async (transaction) => {
    const placementRef = db.collection(ADS_COLLECTION).doc(placement);
    const placementSnapshot = await transaction.get(placementRef);
    const raw = placementSnapshot.data();
    if (!raw || typeof raw.campaign_id === "string") return;
    const hasLegacyCampaign = raw.enabled === true || typeof raw.image_url === "string" ||
      typeof raw.destination_url === "string" || typeof raw.impressions === "number" || typeof raw.clicks === "number";
    if (!hasLegacyCampaign) return;
    const campaignRef = db.collection(CAMPAIGNS_COLLECTION).doc();
    transaction.set(campaignRef, {
      name: `Campagne historique ${placement === "open" ? "Ouverture" : "Bandeau Home"}`,
      advertiser: "Non renseigné",
      placement,
      image_url: readText(raw.image_url),
      destination_url: readText(raw.destination_url),
      start_at: readTimestamp(raw.start_at),
      end_at: readTimestamp(raw.end_at),
      frequency_cap_hours: placement === "open" && typeof raw.frequency_cap_hours === "number"
        ? raw.frequency_cap_hours
        : null,
      status: legacyStatus(raw),
      published: raw.enabled === true,
      impressions: typeof raw.impressions === "number" ? raw.impressions : 0,
      clicks: typeof raw.clicks === "number" ? raw.clicks : 0,
      migrated_from_legacy: true,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    transaction.set(placementRef, { campaign_id: campaignRef.id }, { merge: true });
  })));
}

function overlaps(candidate: CampaignData, other: CampaignData) {
  return adCampaignsOverlap(
    { startDate: toDateInput(candidate.start_at), endDate: toDateInput(candidate.end_at) },
    { startDate: toDateInput(other.start_at), endDate: toDateInput(other.end_at) },
  );
}

function projectCampaign(campaignId: string, campaign: CampaignData) {
  return {
    campaign_id: campaignId,
    enabled: true,
    image_url: campaign.image_url,
    destination_url: campaign.destination_url,
    start_at: campaign.start_at,
    end_at: campaign.end_at,
    ...(campaign.placement === "open" ? { frequency_cap_hours: campaign.frequency_cap_hours } : {}),
    impressions: campaign.impressions,
    clicks: campaign.clicks,
    updated_at: FieldValue.serverTimestamp(),
  };
}

export async function GET(request: NextRequest) {
  try {
    await assertIsAdminRequest(request);
    await migrateLegacyPlacements();
    const campaigns = await getAdminDb().collection(CAMPAIGNS_COLLECTION).orderBy("created_at", "desc").get();
    return NextResponse.json({
      campaigns: campaigns.docs.map((snapshot) => asRecord(snapshot.id, snapshot.data())),
    });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[AD_CAMPAIGNS_LIST]", error);
    return NextResponse.json({ error: "Impossible de charger les campagnes publicitaires." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await assertIsAdminRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const campaign = parseCampaign(body);
    if (!campaign) {
      return NextResponse.json({ error: "Les informations de campagne sont invalides." }, { status: 400 });
    }
    const ref = getAdminDb().collection(CAMPAIGNS_COLLECTION).doc();
    await ref.set({
      ...campaign,
      status: "draft",
      published: false,
      created_by: decodedToken.email ?? decodedToken.uid,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[AD_CAMPAIGN_CREATE]", error);
    return NextResponse.json({ error: "Impossible de créer la campagne publicitaire." }, { status: 500 });
  }
}
