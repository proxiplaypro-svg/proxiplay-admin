export type AdCampaignInput = {
  enabled: boolean;
  imageUrl: string;
  destinationUrl: string;
  startDate: string;
  endDate: string;
  frequencyCapHours: string;
  requiresFrequencyCap: boolean;
};

export const AD_PLACEMENTS = ["open", "home_banner", "home_banner_referral"] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export const AD_CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "active",
  "ended",
  "disabled",
] as const;
export type AdCampaignStatus = (typeof AD_CAMPAIGN_STATUSES)[number];

export type AdCampaignRecord = AdPlacementForm & {
  id: string;
  name: string;
  advertiser: string;
  placement: AdPlacement;
  status: AdCampaignStatus;
  published: boolean;
  sourceCampaignId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdPlacementForm = {
  enabled: boolean;
  imageUrl: string;
  destinationUrl: string;
  startDate: string;
  endDate: string;
  frequencyCapHours: string;
  impressions: number;
  clicks: number;
};

type TimestampLike = {
  toDate: () => Date;
};

type FirestoreAdPlacement = {
  enabled?: unknown;
  image_url?: unknown;
  destination_url?: unknown;
  start_at?: unknown;
  end_at?: unknown;
  frequency_cap_hours?: unknown;
  impressions?: unknown;
  clicks?: unknown;
};

export const EMPTY_AD_PLACEMENT: AdPlacementForm = {
  enabled: false,
  imageUrl: "",
  destinationUrl: "",
  startDate: "",
  endDate: "",
  frequencyCapHours: "",
  impressions: 0,
  clicks: 0,
};

function isTimestampLike(value: unknown): value is TimestampLike {
  return typeof value === "object" && value !== null && "toDate" in value &&
    typeof (value as TimestampLike).toDate === "function";
}

export function formatAdDateInput(value: unknown): string {
  if (!isTimestampLike(value)) return "";
  const date = value.toDate();
  if (Number.isNaN(date.getTime())) return "";

  // Les champs date HTML representent une date civile, pas un instant UTC.
  // Utiliser les composantes locales evite de relire la veille en France.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseAdDateInput(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function readAdPlacement(raw: FirestoreAdPlacement | undefined): AdPlacementForm {
  return {
    enabled: raw?.enabled === true,
    imageUrl: typeof raw?.image_url === "string" ? raw.image_url : "",
    destinationUrl: typeof raw?.destination_url === "string" ? raw.destination_url : "",
    startDate: formatAdDateInput(raw?.start_at),
    endDate: formatAdDateInput(raw?.end_at),
    frequencyCapHours: raw?.frequency_cap_hours != null ? String(raw.frequency_cap_hours) : "",
    impressions: typeof raw?.impressions === "number" ? raw.impressions : 0,
    clicks: typeof raw?.clicks === "number" ? raw.clicks : 0,
  };
}

export function createAdPlacementWrite<TTimestamp>(
  input: AdPlacementForm,
  options: {
    requiresFrequencyCap: boolean;
    createTimestamp: (date: Date) => TTimestamp;
  },
) {
  const startDate = parseAdDateInput(input.startDate);
  const endDate = parseAdDateInput(input.endDate);
  const frequencyCapHours = input.frequencyCapHours.trim();

  return {
    enabled: input.enabled,
    image_url: input.imageUrl.trim(),
    destination_url: input.destinationUrl.trim(),
    start_at: startDate ? options.createTimestamp(startDate) : null,
    end_at: endDate ? options.createTimestamp(endDate) : null,
    ...(options.requiresFrequencyCap
      ? { frequency_cap_hours: frequencyCapHours ? Number(frequencyCapHours) : null }
      : {}),
  };
}

export function isAdPlacement(value: unknown): value is AdPlacement {
  return typeof value === "string" && AD_PLACEMENTS.includes(value as AdPlacement);
}

export function getAdCampaignStatus(
  campaign: Pick<AdCampaignRecord, "published" | "startDate" | "endDate" | "status">,
  now = new Date(),
): AdCampaignStatus {
  if (!campaign.published || campaign.status === "disabled") return campaign.status === "disabled" ? "disabled" : "draft";
  const start = parseAdDateInput(campaign.startDate);
  const end = parseAdDateInput(campaign.endDate);
  if (!start || !end) return "draft";
  if (end.getTime() < now.getTime()) return "ended";
  if (start.getTime() > now.getTime()) return "scheduled";
  return "active";
}

export function adCampaignsOverlap(
  left: Pick<AdCampaignRecord, "startDate" | "endDate">,
  right: Pick<AdCampaignRecord, "startDate" | "endDate">,
): boolean {
  const leftStart = parseAdDateInput(left.startDate);
  const leftEnd = parseAdDateInput(left.endDate);
  const rightStart = parseAdDateInput(right.startDate);
  const rightEnd = parseAdDateInput(right.endDate);
  if (!leftStart || !leftEnd || !rightStart || !rightEnd) return false;
  return leftStart.getTime() < rightEnd.getTime() && rightStart.getTime() < leftEnd.getTime();
}

export function validateAdCampaign(input: AdCampaignInput): string | null {
  const imageUrl = input.imageUrl.trim();
  const destinationUrl = input.destinationUrl.trim();

  if (input.enabled && !imageUrl) {
    return "Une image est obligatoire pour activer une publicité.";
  }

  if (destinationUrl) {
    try {
      const destination = new URL(destinationUrl);
      if (destination.protocol !== "https:" && destination.protocol !== "http:") {
        return "La destination doit être une URL http(s) valide.";
      }
    } catch {
      return "La destination doit être une URL http(s) valide.";
    }
  }

  if (input.startDate && input.endDate && input.endDate <= input.startDate) {
    return "La date de fin doit être postérieure à la date de début.";
  }

  if (input.requiresFrequencyCap && input.frequencyCapHours.trim()) {
    const frequency = Number(input.frequencyCapHours);
    if (!Number.isInteger(frequency) || frequency < 0) {
      return "La fréquence doit être un nombre d’heures positif ou nul.";
    }
  }

  return null;
}
