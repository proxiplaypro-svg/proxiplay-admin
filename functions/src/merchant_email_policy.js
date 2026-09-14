"use strict";

// This gate only applies to operational merchant mail. Auth/password emails
// and player emails must never call it.
async function resolveOperationalMerchantEmail(db, input) {
  let shops;
  if (typeof input.merchantId === "string" && input.merchantId.trim()) {
    const id = input.merchantId.trim();
    const collection = input.merchantCollectionName || "enseignes";
    if (id.includes("/") || !["enseignes", "merchants"].includes(collection)) {
      throw new Error("Invalid merchant reference");
    }
    const shop = await db.collection(collection).doc(id).get();
    shops = shop.exists ? [shop] : [];
  } else {
    // Compatibility with older admin clients. An ambiguous shared address
    // containing a managed shop must not bypass the per-shop policy.
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    if (!email) throw new Error("Merchant reference required");
    const matches = await Promise.all(["enseignes", "merchants"].map(collection => db.collection(collection).where("email", "==", email).get()));
    shops = matches.flatMap(snapshot => snapshot.docs);
  }
  if (!shops.length) return { skipped: true, reason: "merchant_not_found" };
  if (shops.some(shop => shop.data().managed_by_admin === true)) return { skipped: true, reason: "managed_by_admin" };
  const email = String(shops[0].data().email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { skipped: true, reason: "missing_merchant_email" };
  return { skipped: false, email };
}

module.exports = { resolveOperationalMerchantEmail };
