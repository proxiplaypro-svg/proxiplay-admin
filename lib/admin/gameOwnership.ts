import { shopOwnerPath } from './secureGameQr';

// Pure contract shared by every console game writer. No invented admin owner.
export function gameOwnerPath(shop: Record<string, unknown> | undefined): string | null {
  if (!shop) throw new Error('Enseigne introuvable.');
  if (shop.managed_by_admin === true && shop.owner_id == null && shop.owner == null) return null;
  const owner = shopOwnerPath(shop);
  if (!owner) throw new Error('Propriétaire de l’enseigne absent ou incohérent.');
  return owner;
}

export type FulfillmentType = 'merchant' | 'partner' | 'platform';
export function deliveryType(shop: Record<string, unknown>, choice: unknown): FulfillmentType {
  const owner = gameOwnerPath(shop);
  if (choice === 'platform') return 'platform';
  if (choice != null && !['merchant', 'partner'].includes(String(choice))) throw new Error('Remise du lot invalide.');
  if (owner) return 'merchant';
  if (choice == null) throw new Error('Choisissez qui remet le lot.');
  return 'partner';
}

export function partnerDeliveryEnabled(
  shop: Record<string, unknown>,
  fulfillmentType: FulfillmentType,
  requested: unknown,
): boolean {
  const enabled = fulfillmentType === 'partner' && requested === true;
  if (enabled && (typeof shop.email !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(shop.email.trim()))) {
    throw new Error('Renseignez un email partenaire valide avant d’activer l’envoi automatique.');
  }
  return enabled;
}
