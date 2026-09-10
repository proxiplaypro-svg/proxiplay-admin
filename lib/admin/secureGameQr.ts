export const QR_REGENERATION_MESSAGE = "QR sécurisé absent ou expiré : une génération et une réimpression sont nécessaires. Les anciennes affiches sans jeton ne permettent pas l’accès avec le moteur sécurisé.";

export function buildSecureGameQrLink(gameId: string, token: unknown): string {
  if (!gameId || gameId.includes("/") || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    throw new Error("Réponse QR sécurisée invalide.");
  }
  return `https://play.proxiplay.fr/j/${encodeURIComponent(gameId)}?qr_token=${token}`;
}

export function buildSecureGameAppLinks(gameId: string, token: string) {
  const url = new URL(buildSecureGameQrLink(gameId, token));
  const path = `game/${encodeURIComponent(gameId)}${url.search}`;
  const store = encodeURIComponent("https://play.google.com/store/apps/details?id=com.proxiplay.proxiplay");
  return {
    appUrl: `proxiplay://${path}`,
    androidIntentUrl: `intent://${path}#Intent;scheme=proxiplay;package=com.proxiplay.proxiplay;S.browser_fallback_url=${store};end`,
  };
}

export function userPath(value: unknown): string {
  if (value && typeof value === "object" && "path" in value) {
    return typeof value.path === "string" && /^users\/[^/]+$/.test(value.path) ? value.path : "";
  }
  if (typeof value !== "string" || !value) return "";
  const cleaned = value.replace(/^\//, "");
  return /^users\/[^/]+$/.test(cleaned) ? cleaned : /^[^/]+$/.test(cleaned) ? `users/${cleaned}` : "";
}

export function shopOwnerPath(shop: Record<string, unknown>): string {
  const primary = userPath(shop.owner_id);
  const legacy = userPath(shop.owner);
  if ((shop.owner_id != null && !primary) || (shop.owner != null && !legacy) || (primary && legacy && primary !== legacy)) return "";
  return primary || legacy;
}
