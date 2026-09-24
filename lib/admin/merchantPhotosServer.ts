import { createHash } from "node:crypto";
import sharp from "sharp";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAdminApp, getAdminDb } from "@/lib/firebase/admin-app";
import { MerchantError } from "./merchantSchema";
import { MAX_PHOTOS, MAX_UPLOAD_BYTES, type PhotoGallery } from "./merchantPhotos";

type StoredPhoto = { id: string; data: Record<string, unknown> };
type PhotoStore = { save(path: string, bytes: Buffer): Promise<string>; remove(path: string): Promise<void> };
export function productionPhotoStore(): PhotoStore {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  if (!bucketName) throw new MerchantError("Firebase Storage indisponible.", 503);
  const bucket = getStorage(getAdminApp()).bucket(bucketName);
  return {
    async save(path, bytes) {
      // Stable for concurrent retries of the same operation, unpredictable UUID in path.
      const token = createHash("sha256").update(path).digest("hex");
      await bucket.file(path).save(bytes, { resumable: false, metadata: { contentType: "image/webp", metadata: { firebaseStorageDownloadTokens: token } } });
      return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    },
    async remove(path) { await bucket.file(path).delete({ ignoreNotFound: true }); },
  };
}
export async function checkedPhoto(bytes: Buffer, mime: string) {
  const expected: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
  if (!expected[mime] || !bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw new MerchantError("Photo invalide ou trop volumineuse après optimisation.");
  try {
    const image = sharp(bytes, { limitInputPixels: 60000000, animated: false });
    const metadata = await image.metadata();
    if (metadata.format !== expected[mime] || (metadata.pages || 1) > 1) throw new Error();
    return await image.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
  } catch { throw new MerchantError("Le contenu du fichier n’est pas une photo JPEG, PNG ou WebP valide."); }
}
export class MerchantPhotoService {
  constructor(private db: Firestore = getAdminDb(), private store?: PhotoStore) {}
  private ref(id: string) {
    if (!/^[\w-]{1,150}$/.test(id)) throw new MerchantError("Commerce invalide.");
    return this.db.doc(`enseignes/${id}`);
  }
  private async snapshot(id: string, tx?: Transaction) {
    const ref = this.ref(id);
    const shop = tx ? await tx.get(ref) : await ref.get();
    if (!shop.exists) throw new MerchantError("Commerce introuvable.", 404);
    const images = tx ? await tx.get(ref.collection("images")) : await ref.collection("images").get();
    const rows: StoredPhoto[] = images.docs.map(doc => ({ id: doc.id, data: doc.data() })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const cover = shop.get("imageUrl") || shop.get("logo") || "";
    const version = createHash("sha256").update(JSON.stringify({ cover, rows })).digest("hex");
    const photos = rows.filter(row => typeof row.data.url === "string").map(row => ({ id: row.id, url: row.data.url as string }));
    if (typeof cover === "string" && cover && !photos.some(photo => photo.url === cover)) photos.unshift({ id: "__legacy_cover", url: cover });
    else if (cover) photos.sort((a, b) => Number(b.url === cover) - Number(a.url === cover));
    return { ref, shop, rows, photos, version };
  }
  async read(id: string): Promise<PhotoGallery> {
    const { photos, version } = await this.snapshot(id); return { photos, version };
  }
  async save(id: string, form: FormData) {
    const operation = String(form.get("operation") || "");
    if (!/^[a-f0-9-]{36}$/.test(operation)) throw new MerchantError("Identifiant d’enregistrement invalide.");
    const before = await this.snapshot(id);
    if (before.shop.get("photo_operation_id") === operation) return this.read(id);
    if (form.get("version") !== before.version) throw new MerchantError("Les photos ont changé. Rechargez la galerie avant d’enregistrer.", 409);
    let manifest: { id?: string; file?: string }[];
    try { manifest = JSON.parse(String(form.get("manifest"))); } catch { throw new MerchantError("Sélection de photos invalide."); }
    if (!Array.isArray(manifest) || manifest.length > Math.max(MAX_PHOTOS, before.photos.length) || manifest.length > 30) throw new MerchantError("5 photos maximum par commerce.");
    const selected = new Set<string>();
    const pending: { path: string; bytes: Buffer; index: number }[] = [];
    const desired: Record<string, unknown>[] = [];
    for (const [index, item] of manifest.entries()) {
      if (!item || typeof item !== "object" || Boolean(item.id) === Boolean(item.file)) throw new MerchantError("Photo invalide.");
      const key = item.id || item.file!;
      if (selected.has(key)) throw new MerchantError("Photo en double."); selected.add(key);
      if (item.id) {
        const photo = before.photos.find(photo => photo.id === item.id);
        if (!photo) throw new MerchantError("Photo inconnue.");
        desired.push(before.rows.find(row => row.id === item.id)?.data || { url: photo.url });
      } else {
        const file = form.get(item.file!);
        if (!(file instanceof File)) throw new MerchantError("Fichier manquant.");
        const bytes = await checkedPhoto(Buffer.from(await file.arrayBuffer()), file.type);
        pending.push({ path: `enseignes/${id}/photos/${operation}-${index}.webp`, bytes, index });
        desired.push({});
      }
    }
    const uploaded: string[] = [];
    const store = this.store || (pending.length ? productionPhotoStore() : undefined);
    try {
      for (const item of pending) {
        uploaded.push(item.path);
        const url = await store!.save(item.path, item.bytes);
        desired[item.index] = { url, storage_path: item.path, admin_upload: true };
      }
      await this.db.runTransaction(async tx => {
        const current = await this.snapshot(id, tx);
        if (current.shop.get("photo_operation_id") === operation) return;
        if (current.version !== before.version) throw new MerchantError("Les photos ont changé. Rechargez la galerie.", 409);
        // Flutter queries images without orderBy, therefore doc ID order is used.
        // Keep existing document IDs and put the chosen URLs in their desired order.
        const slots = current.rows.map(row => current.ref.collection("images").doc(row.id));
        while (slots.length < desired.length) slots.push(current.ref.collection("images").doc());
        slots.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        slots.forEach((slot, index) => index < desired.length ? tx.set(slot, desired[index]) : tx.delete(slot));
        tx.update(current.ref, { imageUrl: desired[0]?.url || FieldValue.delete(), ...(desired.length ? {} : { logo: FieldValue.delete() }), photo_operation_id: operation });
      });
    } catch (error) {
      // A lost commit acknowledgement must not delete a successfully attached image.
      const saved = await before.ref.get();
      if (saved.get("photo_operation_id") === operation) return this.read(id);
      await Promise.allSettled(uploaded.map(path => store!.remove(path)));
      throw error;
    }
    // Existing mobile files can be shared: only remove objects created by this service.
    const retained = new Set(desired.map(data => data.storage_path));
    const removed = before.rows.filter(row => row.data.admin_upload === true && typeof row.data.storage_path === "string" && row.data.storage_path.startsWith(`enseignes/${id}/photos/`) && !retained.has(row.data.storage_path));
    let cleanupWarning = false;
    if (removed.length) {
      try {
        const cleanupStore = store || productionPhotoStore();
        const cleanup = await Promise.allSettled(removed.map(row => cleanupStore.remove(row.data.storage_path as string)));
        cleanupWarning = cleanup.some(result => result.status === "rejected");
      } catch { cleanupWarning = true; }
    }
    return { ...await this.read(id), cleanupWarning };
  }
}
