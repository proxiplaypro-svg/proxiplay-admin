"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { merchantMediaRequest, uploadMerchantGallery } from "@/lib/admin/merchantMediaClient";
import { optimizeMerchantPhoto } from "@/lib/admin/merchantPhotoOptimization";
import { MAX_PHOTOS, type MerchantPhoto, type PhotoGallery } from "@/lib/admin/merchantPhotos";
export type LocalPhoto = MerchantPhoto & { file?: File };
export function useMerchantPhotos(merchantId?: string) {
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [version, setVersion] = useState("");
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(merchantId)); const [error, setError] = useState("");
  const [notice, setNotice] = useState(""); const [progress, setProgress] = useState<number | null>(null);
  const urls = useRef(new Set<string>()); const operation = useRef(""); const alive = useRef(true);
  const load = useCallback(async () => {
    if (!merchantId) return;
    setLoading(true); setError("");
    try { const data: PhotoGallery = await merchantMediaRequest(`photos?merchantId=${encodeURIComponent(merchantId)}`); if (alive.current) { setPhotos(data.photos); setVersion(data.version); setDirty(false); operation.current = ""; } }
    catch (error) { if (alive.current) setError(error instanceof Error ? error.message : "Impossible de charger les photos."); }
    finally { if (alive.current) setLoading(false); }
  }, [merchantId]);
  useEffect(() => { alive.current = true; void load(); const previews = urls.current; return () => { alive.current = false; previews.forEach(url => URL.revokeObjectURL(url)); previews.clear(); }; }, [load]);
  function change(next: LocalPhoto[]) { setPhotos(next); setDirty(true); setNotice(""); operation.current = ""; }
  async function add(files: File[]) {
    setError(""); setNotice("");
    if (photos.length + files.length > MAX_PHOTOS) { setError("5 photos maximum par commerce."); return; }
    setBusy(true);
    const additions: LocalPhoto[] = [];
    try {
      for (const file of files) {
        const optimized = await optimizeMerchantPhoto(file);
        const url = URL.createObjectURL(optimized); urls.current.add(url);
        additions.push({ id: crypto.randomUUID(), url, file: optimized });
      }
      change([...photos, ...additions]); setNotice("Photos prêtes. Elles seront téléversées lors de l’enregistrement.");
    } catch (error) { additions.forEach(photo => { URL.revokeObjectURL(photo.url); urls.current.delete(photo.url); }); setError(error instanceof Error ? error.message : "Photo invalide."); }
    finally { setBusy(false); }
  }
  async function save(id: string) {
    if (!dirty) return;
    setBusy(true); setError(""); setProgress(0);
    try {
      const baseline: PhotoGallery = version ? { photos: [], version } : await merchantMediaRequest(`photos?merchantId=${encodeURIComponent(id)}`);
      operation.current ||= crypto.randomUUID();
      const form = new FormData(); form.set("operation", operation.current); form.set("version", baseline.version);
      form.set("manifest", JSON.stringify(photos.map((photo, index) => { if (!photo.file) return { id: photo.id }; const key = `photo${index}`; form.set(key, photo.file); return { file: key }; })));
      const result = await uploadMerchantGallery(id, form, setProgress);
      setPhotos(result.photos); setVersion(result.version); setDirty(false); operation.current = "";
      urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current.clear();
      setNotice(result.cleanupWarning ? "Photos enregistrées. Le nettoyage d’un ancien fichier Storage reste à vérifier." : "Photos enregistrées.");
    } catch (error) { const message = error instanceof Error ? error.message : "Échec de l’enregistrement des photos."; setError(message); throw new Error(message); }
    finally { setBusy(false); setProgress(null); }
  }
  return { photos, dirty, busy, loading, error, notice, progress, add, change, save, load: merchantId ? load : undefined, unavailable: loading || Boolean(merchantId && !version) };
}
export type MerchantPhotosState = ReturnType<typeof useMerchantPhotos>;
