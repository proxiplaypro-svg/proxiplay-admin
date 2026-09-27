"use client";

import { doc, getDoc } from 'firebase/firestore';
import { db } from './client-app';
import { gameOwnerPath, deliveryType, partnerDeliveryEnabled, type FulfillmentType } from '../admin/gameOwnership';

export async function resolveGameOwner(collection: string, id: string | null) {
  if (!id) throw new Error('Une enseigne est requise.');
  const shop = await getDoc(doc(db, collection, id));
  const path = gameOwnerPath(shop.data());
  return path ? doc(db, path) : null;
}

export async function resolveGameDelivery(collection: string, id: string | null, choice: unknown) {
  if (!id) throw new Error('Une enseigne est requise.');
  const shop = (await getDoc(doc(db, collection, id))).data();
  if (!shop) throw new Error('Enseigne introuvable.');
  return deliveryType(shop, choice);
}

export async function resolvePartnerDeliveryEnabled(
  collection: string,
  id: string | null,
  fulfillmentType: FulfillmentType,
  requested: unknown,
) {
  if (!id) throw new Error('Une enseigne est requise.');
  const shop = (await getDoc(doc(db, collection, id))).data();
  if (!shop) throw new Error('Enseigne introuvable.');
  return partnerDeliveryEnabled(shop, fulfillmentType, requested);
}
