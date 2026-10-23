// What a published campaign writes for the app. `ads/{placement}` is public
// (guests read it); an adults-only campaign therefore never puts its creative
// there: the image and link go to `ads_restricted/{placement}`, unreadable by
// clients, and the server hands them only to a signed-in adult.

import { normalizeAdCommunicationType } from "./adCampaign";

export type ProjectableCampaign = {
  placement: string;
  image_url: string;
  destination_url: string;
  start_at: unknown;
  end_at: unknown;
  frequency_cap_hours: number | null;
  impressions: number;
  clicks: number;
  adults_only?: boolean;
  communication_type?: string;
};

export function buildAdProjection<T>(
  id: string,
  campaign: ProjectableCampaign,
  sentinels: { deleteField: T; now: T },
) {
  const adultsOnly = campaign.adults_only === true;
  const publicProjection: Record<string, unknown> = {
    campaign_id: id,
    enabled: true,
    adults_only: adultsOnly,
    // Label shown above the Home banners (absent before this field existed).
    communication_type: normalizeAdCommunicationType(campaign.communication_type),
    image_url: adultsOnly ? sentinels.deleteField : campaign.image_url,
    destination_url: adultsOnly ? sentinels.deleteField : campaign.destination_url,
    start_at: campaign.start_at,
    end_at: campaign.end_at,
    ...(campaign.placement === "open" ? { frequency_cap_hours: campaign.frequency_cap_hours } : {}),
    impressions: campaign.impressions,
    clicks: campaign.clicks,
    updated_at: sentinels.now,
  };
  const restricted = adultsOnly
    ? { campaign_id: id, image_url: campaign.image_url, destination_url: campaign.destination_url, updated_at: sentinels.now }
    : null;
  return { publicProjection, restricted };
}

// Where a creative is stored: adults-only images never in the public ads/
// folder (Storage rules: ads/ is fetchable, ads_restricted/ is admin-only).
export function adCreativeFolder(adultsOnly: boolean) {
  return adultsOnly ? "ads_restricted" : "ads";
}

// True when an uploaded image URL sits in the folder matching the campaign's
// age restriction. Empty URLs are considered compatible (nothing uploaded).
export function isCreativeStoredFor(imageUrl: string, adultsOnly: boolean) {
  if (!imageUrl) return true;
  const restricted = imageUrl.includes("/o/ads_restricted%2F");
  return adultsOnly ? restricted : !restricted;
}
