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

type AdDateBoundary = "start" | "end";

export const AD_CAMPAIGN_TIME_ZONE = "Europe/Paris";

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

function parisDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: AD_CAMPAIGN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(fields.year),
    month: Number(fields.month),
    day: Number(fields.day),
    hour: Number(fields.hour === "24" ? "0" : fields.hour),
    minute: Number(fields.minute),
    second: Number(fields.second),
  };
}

function isValidCivilDate(year: number, month: number, day: number) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

function parisMidnightAsUtc(year: number, month: number, day: number) {
  const utcMidnight = Date.UTC(year, month - 1, day);
  const offsetAt = (instant: number) => {
    const parts = parisDateParts(new Date(instant));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant;
  };

  // Re-evaluate the offset after conversion: this covers CET/CEST changes
  // without relying on the server's own timezone.
  let instant = utcMidnight - offsetAt(utcMidnight);
  instant = utcMidnight - offsetAt(instant);
  return new Date(instant);
}

export function formatAdDateInput(value: unknown, boundary: AdDateBoundary = "start"): string {
  if (!isTimestampLike(value)) return "";
  const timestamp = value.toDate();
  const date = boundary === "end" ? new Date(timestamp.getTime() - 1) : timestamp;
  if (Number.isNaN(date.getTime())) return "";

  const { year, month, day } = parisDateParts(date);
  const formattedMonth = String(month).padStart(2, "0");
  const formattedDay = String(day).padStart(2, "0");
  return `${year}-${formattedMonth}-${formattedDay}`;
}

export function parseAdDateInput(value: string, boundary: AdDateBoundary = "start"): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day || !isValidCivilDate(year, month, day)) return null;

  if (boundary === "end") {
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    return parisMidnightAsUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate());
  }
  return parisMidnightAsUtc(year, month, day);
}

export function readAdPlacement(raw: FirestoreAdPlacement | undefined): AdPlacementForm {
  return {
    enabled: raw?.enabled === true,
    imageUrl: typeof raw?.image_url === "string" ? raw.image_url : "",
    destinationUrl: typeof raw?.destination_url === "string" ? raw.destination_url : "",
    startDate: formatAdDateInput(raw?.start_at, "start"),
    endDate: formatAdDateInput(raw?.end_at, "end"),
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
  const startDate = parseAdDateInput(input.startDate, "start");
  const endDate = parseAdDateInput(input.endDate, "end");
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
  const start = parseAdDateInput(campaign.startDate, "start");
  const end = parseAdDateInput(campaign.endDate, "end");
  if (!start || !end) return "draft";
  if (end.getTime() <= now.getTime()) return "ended";
  if (start.getTime() > now.getTime()) return "scheduled";
  return "active";
}

export function adCampaignsOverlap(
  left: Pick<AdCampaignRecord, "startDate" | "endDate">,
  right: Pick<AdCampaignRecord, "startDate" | "endDate">,
): boolean {
  const leftStart = parseAdDateInput(left.startDate, "start");
  const leftEnd = parseAdDateInput(left.endDate, "end");
  const rightStart = parseAdDateInput(right.startDate, "start");
  const rightEnd = parseAdDateInput(right.endDate, "end");
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

  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    return "La date de fin doit être égale ou postérieure à la date de début.";
  }

  if (input.requiresFrequencyCap && input.frequencyCapHours.trim()) {
    const frequency = Number(input.frequencyCapHours);
    if (!Number.isInteger(frequency) || frequency < 0) {
      return "La fréquence doit être un nombre d’heures positif ou nul.";
    }
  }

  return null;
}
