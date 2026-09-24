export const MAX_PHOTOS = 5;
export const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 650 * 1024;
export type MerchantPhoto = { id: string; url: string };
export type PhotoGallery = { photos: MerchantPhoto[]; version: string };
export function validatePhotoFile(file: { type: string; size: number }) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choisissez une photo JPEG, PNG ou WebP.");
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error("Chaque photo doit faire au maximum 12 Mo.");
}
