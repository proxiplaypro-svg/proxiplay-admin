import assert from "node:assert/strict";
import test from "node:test";
import { validateAdCampaign } from "@/lib/admin/adCampaign";

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
    "Une image est obligatoire pour activer une publicite.",
  );
});

test("rejects an invalid click destination", () => {
  assert.equal(
    validateAdCampaign({ ...validCampaign, destinationUrl: "javascript:alert(1)" }),
    "La destination doit etre une URL http(s) valide.",
  );
});

test("rejects a non-positive opening frequency", () => {
  assert.equal(
    validateAdCampaign({ ...validCampaign, frequencyCapHours: "0" }),
    "La frequence doit etre un nombre d heures positif.",
  );
});

test("rejects an empty or reversed campaign window", () => {
  assert.equal(
    validateAdCampaign({ ...validCampaign, startDate: "2026-10-20", endDate: "2026-10-20" }),
    "La date de fin doit etre posterieure a la date de debut.",
  );
});

test("allows a banner without opening-only frequency", () => {
  assert.equal(
    validateAdCampaign({ ...validCampaign, frequencyCapHours: "", requiresFrequencyCap: false }),
    null,
  );
});
