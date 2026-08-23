"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth } from "@/lib/firebase/auth";
import { db, storage } from "@/lib/firebase/client-app";

type Merchant = { id: string; name: string; image: string };
type MerchantChallengeForm = {
  enabled: boolean;
  startDate: string;
  endDate: string;
  targetDays: string;
  enseigneRef: string;
  enseigneName: string;
  enseigneImage: string;
  title: string;
  description: string;
  prizeTitle: string;
  prizeValue: string;
  prizeDescription: string;
  imageUrl: string;
};

const initialForm: MerchantChallengeForm = {
  enabled: false,
  startDate: "",
  endDate: "",
  targetDays: "15",
  enseigneRef: "",
  enseigneName: "",
  enseigneImage: "",
  title: "",
  description: defaultDescription("15", ""),
  prizeTitle: "",
  prizeValue: "",
  prizeDescription: "",
  imageUrl: "",
};

function defaultDescription(days: string, merchantName: string): string {
  return `Jouez sur Proxiplay pendant au moins ${days || "15"} jours différents pendant la période du jeu pour tenter de gagner un lot chez ${merchantName || "le commerçant du mois"}. Une seule journée est comptabilisée par jour. Les joueurs ayant atteint l'objectif participent automatiquement au tirage au sort organisé à la fin du jeu.`;
}

function readDate(value: unknown): string {
  const timestamp = value as { seconds?: number; _seconds?: number } | null;
  const seconds = timestamp?.seconds ?? timestamp?._seconds;
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString().slice(0, 10) : "";
}

function readText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Le fichier selectionne doit etre une image valide.";
  }
  if (file.size > 5 * 1024 * 1024) {
    return "L'image depasse 5 Mo. Choisis un fichier plus leger.";
  }
  return null;
}

export default function MerchantMonthlyChallengePage() {
  const [form, setForm] = useState<MerchantChallengeForm>(initialForm);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionCustomized = useRef(false);

  useEffect(() => {
    let active = true;

    async function loadConfig() {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const response = await fetch("/api/admin/monthly-challenge?type=merchant", {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        });
        if (!response.ok) throw new Error("Impossible de charger le Commercant du mois.");
        const payload = await response.json() as { config?: Record<string, unknown> | null };
        const config = payload.config;
        if (!active || !config) return;

        const description = readText(config.description).trim();
        const enseigneName = readText(config.enseigne_name) || readText(config.restaurant_name);
        const targetDays = String(config.target_days ?? initialForm.targetDays);
        descriptionCustomized.current = Boolean(description);
        setChallengeId(readText(config.challenge_id) || null);
        setForm({
          enabled: config.enabled === true,
          startDate: readDate(config.start_date),
          endDate: readDate(config.end_date),
          targetDays,
          enseigneRef: readText(config.enseigne_ref) || readText(config.restaurant_ref),
          enseigneName,
          enseigneImage: readText(config.enseigne_image) || readText(config.restaurant_image),
          title: readText(config.title),
          description: description || defaultDescription(targetDays, enseigneName),
          prizeTitle: readText(config.prize_title),
          prizeValue: String(config.prize_value ?? ""),
          prizeDescription: readText(config.prize_description),
          imageUrl: readText(config.image_url),
        });
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Impossible de charger la campagne.");
      }
    }

    void loadConfig();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    async function loadMerchants() {
      try {
        const snapshot = await getDocs(collection(db, "enseignes"));
        setMerchants(snapshot.docs.map((document) => {
          const data = document.data();
          return {
            id: document.id,
            name: String(data.name ?? data.nom ?? data.title ?? document.id),
            image: String(data.image_url ?? data.logo ?? data.photo ?? ""),
          };
        }).sort((left, right) => left.name.localeCompare(right.name, "fr")));
      } catch {
        setError("Impossible de charger les enseignes.");
      }
    }

    void loadMerchants();
  }, []);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  function update<K extends keyof MerchantChallengeForm>(key: K, value: MerchantChallengeForm[K]) {
    if (key === "description") descriptionCustomized.current = true;
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(!descriptionCustomized.current && key === "targetDays"
        ? { description: defaultDescription(String(value), current.enseigneName) }
        : {}),
    }));
  }

  function selectMerchant(merchantId: string) {
    const merchant = merchants.find((item) => item.id === merchantId);
    setForm((current) => ({
      ...current,
      enseigneRef: merchant ? `enseignes/${merchant.id}` : "",
      enseigneName: merchant?.name ?? "",
      enseigneImage: merchant?.image ?? "",
      ...(!descriptionCustomized.current
        ? { description: defaultDescription(current.targetDays, merchant?.name ?? "") }
        : {}),
    }));
  }

  async function uploadChallengeImage(file: File): Promise<string> {
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageRef = ref(
      storage,
      `monthly_challenge/merchant_${form.startDate || "config"}/${Date.now()}-${sanitizedFileName}`,
    );
    await uploadBytes(storageRef, file, { contentType: file.type });
    return getDownloadURL(storageRef);
  }

  async function save() {
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Connexion admin requise.");

      const startDate = new Date(`${form.startDate}T00:00`);
      const endDate = new Date(`${form.endDate}T00:00`);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new Error("Les dates de debut et de fin sont obligatoires.");
      }

      let imageUrl = form.imageUrl;
      if (imageFile) {
        const validationError = validateImageFile(imageFile);
        if (validationError) throw new Error(validationError);
        imageUrl = await uploadChallengeImage(imageFile);
      }

      const response = await fetch("/api/admin/monthly-challenge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          type: "merchant",
          enabled: form.enabled,
          start_date: { seconds: Math.floor(startDate.getTime() / 1000), nanoseconds: 0 },
          end_date: { seconds: Math.floor(endDate.getTime() / 1000), nanoseconds: 0 },
          target_days: Number(form.targetDays),
          enseigne_ref: form.enseigneRef,
          enseigne_name: form.enseigneName,
          enseigne_image: form.enseigneImage,
          title: form.title,
          description: form.description,
          prize_title: form.prizeTitle,
          prize_value: Number(form.prizeValue) || 0,
          prize_description: form.prizeDescription,
          image_url: imageUrl,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "Impossible d'enregistrer le Commercant du mois.");
      }
      const body = await response.json() as { config?: Record<string, unknown> };
      setChallengeId(readText(body.config?.challenge_id) || null);
      setForm((prev) => ({ ...prev, imageUrl }));
      setImageFile(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      setMessage("Commercant du mois enregistre.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d'enregistrer le Commercant du mois.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!challengeId) return;
    if (!window.confirm("Supprimer definitivement cette campagne Commercant du mois ?")) return;
    setError(null);
    setMessage(null);
    setDeleting(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Connexion admin requise.");
      const response = await fetch("/api/admin/monthly-challenge", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ type: "merchant", challenge_id: challengeId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "Impossible de supprimer la campagne.");
      }
      setForm(initialForm);
      setChallengeId(null);
      setImageFile(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      descriptionCustomized.current = false;
      setMessage("Campagne supprimee.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Impossible de supprimer la campagne.");
    } finally {
      setDeleting(false);
    }
  }

  function field(label: string, key: keyof MerchantChallengeForm, type = "text") {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-[#666]">{label}</span>
        <input
          className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px]"
          type={type}
          value={String(form[key])}
          onChange={(event) => update(key, event.target.value as never)}
        />
      </label>
    );
  }

  return (
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto grid max-w-[900px] gap-6">
        <div className="flex justify-between">
          <div>
            <h1 className="text-[22px] font-medium">Commercant du mois</h1>
            <p className="mt-1 text-[14px] text-[#666]">Configurez la campagne partenaire et son tirage automatique.</p>
          </div>
          <Link href="/admin/games" className="rounded-[10px] border px-5 py-3 text-[14px]">Retour aux jeux</Link>
        </div>

        <form
          className="rounded-[12px] border bg-white p-5"
          onSubmit={(event) => { event.preventDefault(); void save(); }}
        >
          <label className="mb-4 flex gap-2 text-[13px]">
            <input type="checkbox" checked={form.enabled} onChange={(event) => update("enabled", event.target.checked)} />
            Defi actif
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            {field("Date de debut", "startDate", "date")}
            {field("Date de fin", "endDate", "date")}
            {field("Objectif en jours actifs", "targetDays", "number")}
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#666]">Enseigne partenaire</span>
              <select
                className="rounded-[8px] border px-3 py-2"
                value={form.enseigneRef.replace("enseignes/", "")}
                onChange={(event) => selectMerchant(event.target.value)}
              >
                <option value="">Choisir une enseigne</option>
                {merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}
              </select>
            </label>
            {field("Titre", "title")}
            {field("Lot", "prizeTitle")}
            {field("Valeur du lot", "prizeValue", "number")}
            {field("Detail du lot", "prizeDescription")}

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[12px] font-medium text-[#666]">Image (affichee au joueur)</span>
              <div className="flex items-center gap-3">
                {imagePreviewUrl || form.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imagePreviewUrl || form.imageUrl}
                    alt=""
                    className="h-12 w-12 flex-none rounded-[8px] object-cover"
                  />
                ) : null}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      setImageFile(null);
                      return;
                    }
                    const validationError = validateImageFile(file);
                    if (validationError) {
                      setError(validationError);
                      event.target.value = "";
                      setImageFile(null);
                      return;
                    }
                    setError(null);
                    setImageFile(file);
                  }}
                  className="text-[13px] text-[#666] file:mr-3 file:rounded-[8px] file:border file:border-[#E0E0DA] file:bg-white file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-[#666] hover:file:bg-[#F7F7F5]"
                />
              </div>
            </label>
          </div>

          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#666]">Règlement / explication du jeu</span>
            <textarea
              className="min-h-28 rounded-[8px] border px-3 py-2 text-[14px]"
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
            />
          </label>

          {error ? <p className="mt-4 text-[#E24B4A]">{error}</p> : null}
          {message ? <p className="mt-4 text-[#3B6D11]">{message}</p> : null}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-[10px] bg-[#639922] px-5 py-3 text-white disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            {challengeId ? (
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDelete()}
                className="rounded-[10px] border border-[#E24B4A] px-5 py-3 text-[#E24B4A] disabled:opacity-50"
              >
                {deleting ? "Suppression…" : "Supprimer la campagne"}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
