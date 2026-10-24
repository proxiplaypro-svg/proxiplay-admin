import assert from "node:assert/strict";
import test from "node:test";
import { buildAdProjection } from "./lib/admin/adProjection";

const DELETE = "<delete>";
const NOW = "<now>";
const base = {
  placement: "home_banner", image_url: "https://x/ad.png", destination_url: "https://x/shop",
  start_at: "S", end_at: "E", frequency_cap_hours: null, impressions: 3, clicks: 1,
};

test("campagne ordinaire : création publique, rien de restreint (comportement inchangé)", () => {
  const { publicProjection, restricted } = buildAdProjection("c1", base, { deleteField: DELETE, now: NOW });
  assert.equal(publicProjection.image_url, "https://x/ad.png");
  assert.equal(publicProjection.destination_url, "https://x/shop");
  assert.equal(publicProjection.adults_only, false);
  assert.equal(publicProjection.campaign_id, "c1");
  assert.equal(publicProjection.enabled, true);
  assert.equal(restricted, null);
  assert.equal("frequency_cap_hours" in publicProjection, false);
});

test("campagne réservée aux majeurs : jamais d'image ni de lien dans le document public", () => {
  const { publicProjection, restricted } = buildAdProjection("adult", { ...base, placement: "open", frequency_cap_hours: 24, adults_only: true }, { deleteField: DELETE, now: NOW });
  assert.equal(publicProjection.adults_only, true);
  assert.equal(publicProjection.image_url, DELETE);
  assert.equal(publicProjection.destination_url, DELETE);
  assert.equal(publicProjection.frequency_cap_hours, 24);
  assert.deepEqual(restricted, { campaign_id: "adult", image_url: "https://x/ad.png", destination_url: "https://x/shop", updated_at: NOW });
});

test("campagnes existantes sans le champ : traitées comme ordinaires", () => {
  const { publicProjection, restricted } = buildAdProjection("old", { ...base, adults_only: undefined }, { deleteField: DELETE, now: NOW });
  assert.equal(publicProjection.adults_only, false);
  assert.equal(publicProjection.image_url, "https://x/ad.png");
  assert.equal(restricted, null);
});

test("une image de campagne réservée aux majeurs est rangée hors du dossier public", async () => {
  const { adCreativeFolder, isCreativeStoredFor } = await import("./lib/admin/adProjection");
  const pub = "https://firebasestorage.googleapis.com/v0/b/b/o/ads%2Fopen%2F1.png?alt=media&token=t";
  const restricted = "https://firebasestorage.googleapis.com/v0/b/b/o/ads_restricted%2Fopen%2F1.png?alt=media&token=t";
  assert.equal(adCreativeFolder(true), "ads_restricted");
  assert.equal(adCreativeFolder(false), "ads");
  assert.equal(isCreativeStoredFor(restricted, true), true);
  assert.equal(isCreativeStoredFor(pub, true), false, "image publique refusée pour une campagne majeurs");
  assert.equal(isCreativeStoredFor(restricted, false), false, "image restreinte jamais exposée par une campagne ordinaire");
  assert.equal(isCreativeStoredFor(pub, false), true);
  assert.equal(isCreativeStoredFor("", true), true);
});

test("type de communication : trois valeurs, « Publicité » par défaut et pour les anciennes campagnes", async () => {
  const { AD_COMMUNICATION_LABEL, isAdCommunicationType, normalizeAdCommunicationType } = await import("./lib/admin/adCampaign");
  assert.deepEqual(AD_COMMUNICATION_LABEL, { advertisement: "Publicité", discovery: "À découvrir", proxiplay_info: "Info ProxiPlay" });
  assert.equal(normalizeAdCommunicationType(undefined), "advertisement", "ancienne campagne sans champ");
  assert.equal(normalizeAdCommunicationType("discovery"), "discovery");
  assert.equal(normalizeAdCommunicationType("proxiplay_info"), "proxiplay_info");
  assert.equal(normalizeAdCommunicationType("autre"), "advertisement");
  assert.equal(isAdCommunicationType("autre"), false, "valeur inconnue refusée à l’enregistrement");
});

test("la projection transmet le type à l’app, « Publicité » pour une campagne sans type", () => {
  const sentinels = { deleteField: DELETE, now: NOW };
  assert.equal(buildAdProjection("c", { ...base, communication_type: "discovery" }, sentinels).publicProjection.communication_type, "discovery");
  assert.equal(buildAdProjection("c", { ...base, communication_type: "proxiplay_info" }, sentinels).publicProjection.communication_type, "proxiplay_info");
  assert.equal(buildAdProjection("c", base, sentinels).publicProjection.communication_type, "advertisement");
  // The rest of the projection is unchanged.
  const projection = buildAdProjection("c", { ...base, communication_type: "discovery" }, sentinels).publicProjection;
  assert.equal(projection.image_url, base.image_url);
  assert.equal(projection.enabled, true);
});

test("libellé affiché dans l’app : texte libre, sinon le libellé du type (« Publicité » par défaut)", () => {
  const sentinels = { deleteField: DELETE, now: NOW };
  const label = (campaign: Record<string, unknown>) =>
    buildAdProjection("c", { ...base, ...campaign }, sentinels).publicProjection.display_label;
  assert.equal(label({}), "Publicité", "ancienne campagne sans libellé ni type");
  assert.equal(label({ display_label: null }), "Publicité");
  assert.equal(label({ display_label: "  Partenaire   local " }), "Partenaire local");
  assert.equal(label({ display_label: "", communication_type: "discovery" }), "À découvrir");
  assert.equal(label({ display_label: "Offre du mois", communication_type: "proxiplay_info" }), "Offre du mois");
  // Images, URL, dates and statistics are untouched by the label.
  const projection = buildAdProjection("c", { ...base, display_label: "Offre du mois" }, sentinels).publicProjection;
  assert.equal(projection.image_url, base.image_url);
  assert.equal(projection.destination_url, base.destination_url);
  assert.equal(projection.start_at, "S");
  assert.equal(projection.end_at, "E");
  assert.equal(projection.impressions, 3);
  assert.equal(projection.clicks, 1);
});

test("libellé affiché dans l’app : 24 caractères au plus, jamais de caractère de contrôle", async () => {
  const { AD_DISPLAY_LABEL_MAX_LENGTH, isValidAdDisplayLabel, cleanAdDisplayLabel } = await import("./lib/admin/adCampaign");
  assert.equal(AD_DISPLAY_LABEL_MAX_LENGTH, 24);
  assert.equal(isValidAdDisplayLabel(undefined), true);
  assert.equal(isValidAdDisplayLabel(null), true);
  assert.equal(isValidAdDisplayLabel("x".repeat(24)), true);
  assert.equal(isValidAdDisplayLabel("x".repeat(25)), false);
  assert.equal(isValidAdDisplayLabel(`${"x".repeat(23)}🎉`), true, "un emoji compte pour un caractère");
  assert.equal(isValidAdDisplayLabel("Ligne\nsuivante"), false);
  assert.equal(isValidAdDisplayLabel(42), false);
  assert.equal(cleanAdDisplayLabel("  Offre   du  mois "), "Offre du mois");
});
