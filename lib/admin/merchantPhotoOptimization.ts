"use client";
import { MAX_UPLOAD_BYTES, validatePhotoFile } from "./merchantPhotos";
export async function optimizeMerchantPhoto(file: File): Promise<File> {
  validatePhotoFile(file);
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("Cette photo ne peut pas être ouverte."); }
  try {
    if (bitmap.width * bitmap.height > 60000000) throw new Error("La résolution de cette photo est trop élevée (60 mégapixels maximum).");
    for (const maxSize of [1600, 1280, 1024]) {
      const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const context = canvas.getContext("2d"); if (!context) throw new Error("Optimisation des photos indisponible.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.76]) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
        if (blob && blob.type === "image/webp" && blob.size <= MAX_UPLOAD_BYTES) return new File([blob], "photo.webp", { type: "image/webp" });
      }
    }
    throw new Error("La photo reste trop volumineuse. Choisissez une image plus petite.");
  } finally { bitmap.close(); }
}
