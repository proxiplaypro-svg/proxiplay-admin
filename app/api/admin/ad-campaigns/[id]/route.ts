import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adCampaignsOverlap, getAdCampaignStatus, isAdPlacement, type AdCampaignRecord } from "@/lib/admin/adCampaign";
import { getAdminDb } from "@/lib/firebase/admin-app";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";

type CampaignData = {
  name: string;
  advertiser: string;
  placement: "open" | "home_banner";
  image_url: string;
  destination_url: string;
  start_at: Timestamp;
  end_at: Timestamp;
  frequency_cap_hours: number | null;
  published: boolean;
  status: string;
  source_campaign_id: string | null;
  impressions: number;
  clicks: number;
};

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

function toInput(value: Timestamp | null | undefined) {
  if (!value) return "";
  const date = value.toDate();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: unknown) {
  const input = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const [year, month, day] = input.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? Timestamp.fromDate(date)
    : null;
}

function asCampaign(data: Record<string, unknown>): CampaignData | null {
  if (!isAdPlacement(data.placement) || !(data.start_at instanceof Timestamp) || !(data.end_at instanceof Timestamp)) return null;
  return {
    name: text(data.name), advertiser: text(data.advertiser), placement: data.placement,
    image_url: text(data.image_url), destination_url: text(data.destination_url),
    start_at: data.start_at, end_at: data.end_at,
    frequency_cap_hours: typeof data.frequency_cap_hours === "number" ? data.frequency_cap_hours : null,
    published: data.published === true, status: text(data.status) || "draft",
    source_campaign_id: text(data.source_campaign_id) || null,
    impressions: typeof data.impressions === "number" ? data.impressions : 0,
    clicks: typeof data.clicks === "number" ? data.clicks : 0,
  };
}

function mergeCampaign(current: CampaignData, body: Record<string, unknown>): CampaignData | null {
  const placement = body.placement === undefined ? current.placement : body.placement;
  const startAt = body.start_date === undefined ? current.start_at : parseDate(body.start_date);
  const endAt = body.end_date === undefined ? current.end_at : parseDate(body.end_date);
  const frequency = body.frequency_cap_hours === undefined ? current.frequency_cap_hours
    : body.frequency_cap_hours === "" || body.frequency_cap_hours === null ? null : Number(body.frequency_cap_hours);
  if (!isAdPlacement(placement) || !startAt || !endAt || startAt.toMillis() >= endAt.toMillis()) return null;
  const candidate = {
    ...current,
    name: body.name === undefined ? current.name : text(body.name),
    advertiser: body.advertiser === undefined ? current.advertiser : text(body.advertiser),
    placement, start_at: startAt, end_at: endAt, frequency_cap_hours: frequency,
    image_url: body.image_url === undefined ? current.image_url : text(body.image_url),
    destination_url: body.destination_url === undefined ? current.destination_url : text(body.destination_url),
  };
  if (!candidate.name || !candidate.advertiser || !candidate.image_url ||
    (candidate.placement === "open" && (!Number.isInteger(frequency) || (frequency ?? -1) < 0))) return null;
  if (candidate.placement === "home_banner" && frequency !== null) return null;
  if (candidate.destination_url) {
    try { const url = new URL(candidate.destination_url); if (!["http:", "https:"].includes(url.protocol)) return null; } catch { return null; }
  }
  return candidate;
}

function statusOf(campaign: CampaignData) {
  const record = {
    id: "", name: campaign.name, advertiser: campaign.advertiser, placement: campaign.placement,
    enabled: campaign.published,
    imageUrl: campaign.image_url, destinationUrl: campaign.destination_url,
    startDate: toInput(campaign.start_at), endDate: toInput(campaign.end_at),
    frequencyCapHours: campaign.frequency_cap_hours == null ? "" : String(campaign.frequency_cap_hours),
    status: campaign.status === "disabled" ? "disabled" : "draft", published: campaign.published,
    sourceCampaignId: campaign.source_campaign_id, impressions: campaign.impressions, clicks: campaign.clicks,
    createdAt: null, updatedAt: null,
  } satisfies AdCampaignRecord;
  return getAdCampaignStatus(record);
}

function overlaps(left: CampaignData, right: CampaignData) {
  return adCampaignsOverlap(
    { startDate: toInput(left.start_at), endDate: toInput(left.end_at) },
    { startDate: toInput(right.start_at), endDate: toInput(right.end_at) },
  );
}

function projection(id: string, campaign: CampaignData) {
  return {
    campaign_id: id, enabled: true, image_url: campaign.image_url,
    destination_url: campaign.destination_url, start_at: campaign.start_at, end_at: campaign.end_at,
    ...(campaign.placement === "open" ? { frequency_cap_hours: campaign.frequency_cap_hours } : {}),
    impressions: campaign.impressions, clicks: campaign.clicks, updated_at: FieldValue.serverTimestamp(),
  };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertIsAdminRequest(request);
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const db = getAdminDb();
    const result = await db.runTransaction(async (transaction) => {
      const ref = db.collection("ad_campaigns").doc(id);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return { error: "Campagne introuvable.", status: 404 };
      const current = asCampaign(snapshot.data() ?? {});
      if (!current) return { error: "Campagne invalide.", status: 409 };
      const action = text(body.action);

      if (action === "deactivate") {
        const placementRef = db.collection("ads").doc(current.placement);
        const placement = await transaction.get(placementRef);
        transaction.set(ref, { published: false, status: "disabled", disabled_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() }, { merge: true });
        if (placement.data()?.campaign_id === id) transaction.set(placementRef, { enabled: false, updated_at: FieldValue.serverTimestamp() }, { merge: true });
        return { ok: true };
      }

      const candidate = mergeCampaign(current, body);
      if (!candidate) return { error: "Les informations de campagne sont invalides.", status: 400 };
      const wantsPublish = action === "publish" || candidate.published;
      const next = { ...candidate, published: wantsPublish, status: candidate.status };
      const samePlacement = await transaction.get(db.collection("ad_campaigns").where("placement", "==", candidate.placement));
      const conflicts = samePlacement.docs.some((other) => {
        if (other.id === id) return false;
        const otherCampaign = asCampaign(other.data());
        return otherCampaign?.published === true && otherCampaign.status !== "disabled" && overlaps(candidate, otherCampaign);
      });
      if (wantsPublish && conflicts) return { error: "Cette période chevauche une campagne publiée sur le même emplacement.", status: 409 };

      const nextStatus = wantsPublish ? statusOf({ ...next, published: true }) : "draft";
      transaction.set(ref, { ...next, status: nextStatus, published: wantsPublish, updated_at: FieldValue.serverTimestamp() }, { merge: true });
      if (wantsPublish && nextStatus !== "ended") {
        const hasOtherActive = samePlacement.docs.some((other) => {
          if (other.id === id) return false;
          const otherCampaign = asCampaign(other.data());
          return otherCampaign?.published === true && statusOf(otherCampaign) === "active";
        });
        if (!hasOtherActive || nextStatus === "active") {
          transaction.set(db.collection("ads").doc(candidate.placement), projection(id, next), { merge: true });
        }
      }
      return { ok: true };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[AD_CAMPAIGN_UPDATE]", error);
    return NextResponse.json({ error: "Impossible de modifier la campagne publicitaire." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertIsAdminRequest(request);
    const { id } = await params;
    const db = getAdminDb();
    const result = await db.runTransaction(async (transaction) => {
      const campaignRef = db.collection("ad_campaigns").doc(id);
      const openProjectionRef = db.collection("ads").doc("open");
      const homeBannerProjectionRef = db.collection("ads").doc("home_banner");
      const [campaignSnapshot, openProjection, homeBannerProjection] = await Promise.all([
        transaction.get(campaignRef),
        transaction.get(openProjectionRef),
        transaction.get(homeBannerProjectionRef),
      ]);

      if (!campaignSnapshot.exists) return { error: "Campagne introuvable.", status: 404 };
      const campaign = asCampaign(campaignSnapshot.data() ?? {});
      if (!campaign) return { error: "Campagne invalide.", status: 409 };
      if (campaign.status !== "disabled") {
        return { error: "Seules les campagnes désactivées peuvent être supprimées.", status: 409 };
      }

      const activeProjectionStillReferencesCampaign = [openProjection, homeBannerProjection]
        .some((projection) => projection.data()?.campaign_id === id && projection.data()?.enabled === true);
      if (activeProjectionStillReferencesCampaign) {
        return { error: "Cette campagne est encore référencée par une projection publicitaire active.", status: 409 };
      }

      transaction.delete(campaignRef);
      return { ok: true };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[AD_CAMPAIGN_DELETE]", error);
    return NextResponse.json({ error: "Impossible de supprimer la campagne publicitaire." }, { status: 500 });
  }
}
