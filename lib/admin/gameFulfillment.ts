export type GameFulfillmentType = "merchant" | "partner" | "platform";

export type ShopOwnerState =
  | { kind: "owner"; ownerPath: string }
  | { kind: "none" }
  | { kind: "invalid" };

// Mirror of userPath() in firebase/functions/merchant_ownership.js.
function userPath(value: unknown): string {
  if (value && typeof value === "object" && typeof (value as { path?: unknown }).path === "string") {
    const path = (value as { path: string }).path;
    return /^users\/[^/]+$/.test(path) ? path : "";
  }
  if (typeof value !== "string" || !value) return "";
  const cleaned = value.replace(/^\//, "");
  if (/^users\/[^/]+$/.test(cleaned)) return cleaned;
  return /^[^/]+$/.test(cleaned) ? `users/${cleaned}` : "";
}

/**
 * Mirror of shopOwnerPath() in the Cloud Functions: the server decides from
 * these exact rules whether a shop has a merchant account. A malformed or
 * conflicting identity is "invalid" and must never be treated as ownerless.
 */
export function resolveShopOwner(shop: { owner?: unknown; owner_id?: unknown } | undefined): ShopOwnerState {
  const ownerId = shop?.owner_id ?? null;
  const owner = shop?.owner ?? null;
  if (ownerId === null && owner === null) return { kind: "none" };
  const primary = ownerId === null ? "" : userPath(ownerId);
  const legacy = owner === null ? "" : userPath(owner);
  if ((ownerId !== null && !primary) || (owner !== null && !legacy) || (primary && legacy && primary !== legacy)) {
    return { kind: "invalid" };
  }
  return { kind: "owner", ownerPath: primary || legacy };
}

/** Fields shown by the game creation form for a shop (see GameMerchantOption). */
export function merchantDeliveryInfo(shop: { owner?: unknown; owner_id?: unknown; email?: unknown }) {
  const owner = resolveShopOwner(shop);
  return {
    hasMerchantOwner: owner.kind === "owner",
    ownerInvalid: owner.kind === "invalid",
    email: typeof shop.email === "string" ? shop.email.trim() : "",
  };
}

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function isValidPartnerEmail(value: string) {
  return emailPattern.test(value.trim());
}

/** What the administrator chooses: who hands the prize to the winner. */
export type PrizeDeliverer = "commercant" | "proxiplay";

export type GameFulfillmentPlan = {
  fulfillmentType: GameFulfillmentType;
  /** Fields to write on the shop, in the same batch as the game. Empty for a shop with an account. */
  shopPatch: { managed_by_admin?: true; email?: string };
};

/**
 * Translates the administrator's choice into the fields the Cloud Functions
 * expect (prize_fulfillment.js / merchant_ownership.js):
 * - shop with an account: "commercant" = merchant (unchanged model), "proxiplay" = platform;
 * - shop without an account: "commercant" = partner (winners sent by e-mail), "proxiplay" = platform,
 *   and the shop must be flagged managed_by_admin. No owner is ever invented.
 * An existing shop e-mail is never overwritten.
 */
export function planGameFulfillment(input: {
  owner: ShopOwnerState;
  deliverer: PrizeDeliverer;
  shop: { email?: unknown; managed_by_admin?: unknown };
  partnerEmail: string;
}): GameFulfillmentPlan {
  if (input.owner.kind === "invalid") {
    throw new Error("Le propriétaire de ce commerce est incohérent : corrigez la fiche commerçant avant de créer un jeu.");
  }
  if (input.deliverer !== "commercant" && input.deliverer !== "proxiplay") {
    throw new Error("Choisissez qui remet le lot : le commerçant ou ProxiPlay.");
  }
  if (input.owner.kind === "owner") {
    return { fulfillmentType: input.deliverer === "proxiplay" ? "platform" : "merchant", shopPatch: {} };
  }

  const shopPatch: GameFulfillmentPlan["shopPatch"] =
    input.shop.managed_by_admin === true ? {} : { managed_by_admin: true };
  if (input.deliverer === "proxiplay") return { fulfillmentType: "platform", shopPatch };

  const shopEmail = typeof input.shop.email === "string" ? input.shop.email.trim() : "";
  const typed = input.partnerEmail.trim().toLowerCase();
  if (shopEmail) {
    if (!isValidPartnerEmail(shopEmail)) {
      throw new Error(`L'e-mail de la fiche commerçant (${shopEmail}) est invalide : corrigez la fiche avant de créer le jeu.`);
    }
    if (typed && typed !== shopEmail.toLowerCase()) {
      throw new Error(`Ce commerce a déjà l'adresse ${shopEmail}. Elle n'est pas remplacée : modifiez la fiche commerçant si les gagnants doivent être envoyés ailleurs.`);
    }
    return { fulfillmentType: "partner", shopPatch };
  }
  if (!isValidPartnerEmail(typed)) {
    throw new Error("Indiquez une adresse e-mail valide pour transmettre la liste des gagnants au commerçant.");
  }
  return { fulfillmentType: "partner", shopPatch: { ...shopPatch, email: typed } };
}
