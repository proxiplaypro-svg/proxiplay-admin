"use strict";

function shopPath(value) {
  const path = typeof value === "string" ? value.replace(/^\//, "") : value?.path;
  return typeof path === "string" && /^enseignes\/[^/]+$/.test(path) ? path : "";
}

// Resolve from the actual game before considering denormalized prize data.
// Missing/contradictory references never authorize operational mail.
async function resolvePrizeMerchantEmailPolicy(db, prizeData, gameData) {
  const gamePath = shopPath(gameData?.enseigne_id);
  const prizePath = shopPath(prizeData?.enseigne_id);
  const path = gamePath || prizePath;
  if (!path) return { skipped: true, reason: "merchant_enseigne_unresolved" };
  const shop = await db.doc(path).get();
  if (!shop.exists) return { skipped: true, reason: "merchant_enseigne_missing" };
  return shop.data().managed_by_admin === true
    ? { skipped: true, reason: "managed_by_admin" }
    : { skipped: false };
}

module.exports = { resolvePrizeMerchantEmailPolicy };
