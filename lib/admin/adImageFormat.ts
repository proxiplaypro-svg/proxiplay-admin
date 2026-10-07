import type { AdPlacement } from "@/lib/admin/adCampaign";

export type AdImageFormat = {
  width: number;
  height: number;
  ratioLabel: string;
  cssAspectRatio: string;
  expectedRatio: number;
};

export const AD_IMAGE_FORMATS: Record<AdPlacement, AdImageFormat> = {
  home_banner: { width: 1200, height: 400, ratioLabel: "3:1", cssAspectRatio: "3 / 1", expectedRatio: 3 },
  open: { width: 1080, height: 1920, ratioLabel: "9:16", cssAspectRatio: "9 / 16", expectedRatio: 9 / 16 },
};

export function getAdImageFormat(placement: AdPlacement) {
  return AD_IMAGE_FORMATS[placement];
}

// Accept exports a few pixels off the reference dimensions without accepting
// artwork that will visibly crop or letterbox in the application.
export function isAdImageRatioCompatible(placement: AdPlacement, width: number, height: number, tolerance = 0.03) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  const expectedRatio = getAdImageFormat(placement).expectedRatio;
  return Math.abs(width / height - expectedRatio) / expectedRatio <= tolerance;
}
