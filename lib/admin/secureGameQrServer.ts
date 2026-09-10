import { getAdminDb } from "@/lib/firebase/admin-app";
import { buildSecureGameQrLink, shopOwnerPath, userPath } from "./secureGameQr";

// Read-only: viewing/exporting an existing game must never mint or rotate a token.
export async function readSecureGameQr(gameId: string) {
  const db = getAdminDb();
  return db.runTransaction(async (tx) => {
    const gameRef = db.doc(`games/${gameId}`);
    const game = (await tx.get(gameRef)).data();
    if (!game) return { state: "not-found" as const };
    if (game.access_mode !== "qr_only") return { state: "public" as const };
    if (!game.end_date?.toMillis || game.end_date.toMillis() <= Date.now() || ["ended", "cancelled", "canceled", "disabled"].includes(game.status)) {
      return { state: "ended" as const };
    }
    const proof = (await tx.get(db.doc(`game_qr_access/${gameId}`))).data();
    const shop = (game.enseigne_id || game.enseigne_ref)?.path || "";
    const shopData = /^enseignes\/[^/]+$/.test(shop) ? (await tx.get(db.doc(shop))).data() : undefined;
    if (!proof || proof.game_path !== gameRef.path || proof.shop_path !== shop ||
        proof.owner_path !== userPath(game.owner_id) || proof.shop_owner_path !== shopOwnerPath(shopData ?? {}) ||
        !proof.expires_at?.toMillis || proof.expires_at.toMillis() <= Date.now() ||
        typeof proof.token !== "string" || !/^[a-f0-9]{64}$/.test(proof.token)) {
      return { state: "regeneration-required" as const };
    }
    return { state: "ready" as const, url: buildSecureGameQrLink(gameId, proof.token) };
  });
}
