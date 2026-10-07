import assert from "node:assert/strict";
import test from "node:test";
import {
  adCampaignsOverlap,
  createAdPlacementWrite,
  getAdCampaignStatus,
  readAdPlacement,
  validateAdCampaign,
} from "@/lib/admin/adCampaign";
import { getAdImageFormat, isAdImageRatioCompatible } from "@/lib/admin/adImageFormat";

const validCampaign = {
  enabled: true,
  imageUrl: "https://firebasestorage.googleapis.com/ad.png",
  destinationUrl: "https://example.com/offre",
  startDate: "2026-10-10",
  endDate: "2026-10-20",
  frequencyCapHours: "24",
  requiresFrequencyCap: true,
};

test("accepts a valid opening campaign", () => {
  assert.equal(validateAdCampaign(validCampaign), null);
});

test("requires an image before activating a campaign", () => {
  assert.equal(
    validateAdCampaign({ ...validCampaign, imageUrl: "  " }),
    "Une image est obligatoire pour activer une publicité.",
  );
});

test("rejects an invalid click destination", () => {
  assert.equal(
    validateAdCampaign({ ...validCampaign, destinationUrl: "javascript:alert(1)" }),
    "La destination doit être une URL http(s) valide.",
  );
});

test("rejects a non-positive opening frequency", () => {
  assert.equal(
    validateAdCampaign({ ...validCampaign, frequencyCapHours: "0" }),
    "La fréquence doit être un nombre d’heures positif.",
  );
});

test("rejects an empty or reversed campaign window", () => {
  assert.equal(
    validateAdCampaign({ ...validCampaign, startDate: "2026-10-20", endDate: "2026-10-20" }),
    "La date de fin doit être postérieure à la date de début.",
  );
});

test("allows a banner without opening-only frequency", () => {
  assert.equal(
    validateAdCampaign({ ...validCampaign, frequencyCapHours: "", requiresFrequencyCap: false }),
    null,
  );
});

function assertSaveThenReadPreservesCampaign(requiresFrequencyCap: boolean) {
  const form = {
    enabled: true,
    imageUrl: "https://firebasestorage.googleapis.com/ads/campaign.png",
    destinationUrl: "https://example.com/offre",
    startDate: "2026-10-10",
    endDate: "2026-10-20",
    frequencyCapHours: requiresFrequencyCap ? "24" : "",
    impressions: 12,
    clicks: 3,
  };

  const written = createAdPlacementWrite(form, {
    requiresFrequencyCap,
    createTimestamp: (date) => ({ toDate: () => date }),
  });
  const reloaded = readAdPlacement({
    ...written,
    impressions: form.impressions,
    clicks: form.clicks,
  });

  assert.deepEqual(reloaded, form);
}

test("save then reload preserves an opening campaign", () => {
  assertSaveThenReadPreservesCampaign(true);
});

test("save then reload preserves a Home banner campaign", () => {
  assertSaveThenReadPreservesCampaign(false);
});

test("campaign status distinguishes draft, scheduled, active, ended and disabled", () => {
  const base = { ...validCampaign, id: "c", name: "Campagne", advertiser: "Annonceur", placement: "open" as const, sourceCampaignId: null, impressions: 0, clicks: 0, createdAt: null, updatedAt: null, enabled: true, published: true, status: "draft" as const };
  assert.equal(getAdCampaignStatus({ ...base, startDate: "2026-10-20", endDate: "2026-10-30" }, new Date("2026-10-15")), "scheduled");
  assert.equal(getAdCampaignStatus({ ...base, startDate: "2026-10-10", endDate: "2026-10-20" }, new Date("2026-10-15")), "active");
  assert.equal(getAdCampaignStatus({ ...base, startDate: "2026-10-01", endDate: "2026-10-10" }, new Date("2026-10-15")), "ended");
  assert.equal(getAdCampaignStatus({ ...base, published: false, status: "disabled" }, new Date("2026-10-15")), "disabled");
});

test("overlapping campaigns on one placement are detected", () => {
  assert.equal(adCampaignsOverlap({ startDate: "2026-10-10", endDate: "2026-10-20" }, { startDate: "2026-10-19", endDate: "2026-10-30" }), true);
  assert.equal(adCampaignsOverlap({ startDate: "2026-10-10", endDate: "2026-10-20" }, { startDate: "2026-10-20", endDate: "2026-10-30" }), false);
});

test("accepts flexible 3:1 Home banner dimensions and warns on a vertical image", () => {
  assert.equal(getAdImageFormat("home_banner").ratioLabel, "3:1");
  assert.equal(isAdImageRatioCompatible("home_banner", 1200, 400), true);
  assert.equal(isAdImageRatioCompatible("home_banner", 1800, 600), true);
  assert.equal(isAdImageRatioCompatible("home_banner", 1080, 1920), false);
});

test("accepts flexible 9:16 opening dimensions and warns on a banner", () => {
  assert.equal(getAdImageFormat("open").ratioLabel, "9:16");
  assert.equal(isAdImageRatioCompatible("open", 1080, 1920), true);
  assert.equal(isAdImageRatioCompatible("open", 2160, 3840), true);
  assert.equal(isAdImageRatioCompatible("open", 1200, 400), false);
});
