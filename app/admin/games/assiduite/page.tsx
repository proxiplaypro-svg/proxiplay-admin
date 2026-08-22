"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase/client-app";
import { auth } from "@/lib/firebase/auth";

type MonthlyChallengeConfig = {
  enabled: boolean;
  startDate: string;
  endDate: string;
  title: string;
  description: string;
  targetDays: string;
  prizeTitle: string;
  prizeDescription: string;
  prizeValue: string;
  imageUrl: string;
};

const emptyForm: MonthlyChallengeConfig = {
  enabled: false,
  startDate: "",
  endDate: "",
  title: "",
  description: "",
  targetDays: "15",
  prizeTitle: "",
  prizeDescription: "",
  prizeValue: "",
  imageUrl: "",
};

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDateTimeLocalInputValue(timestamp: unknown): string {
  const date =
    timestamp && typeof timestamp === "object" && "_seconds" in (timestamp as Record<string, unknown>)
      ? new Date(((timestamp as Record<string, unknown>)._seconds as number) * 1000)
      : timestamp && typeof timestamp === "object" && "seconds" in (timestamp as Record<string, unknown>)
        ? new Date(((timestamp as Record<string, unknown>).seconds as number) * 1000)
        : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function parseDateTimeLocalToTimestampPayload(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 };
}

async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Connexion admin requise.");
  return user.getIdToken();
}

async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  });
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

function defaultDescription(targetDays: string) {
  return `Jouez sur Proxiplay pendant au moins ${targetDays || "15"} jours differents pendant la periode du jeu. Une seule journee est comptabilisee, quel que soit le nombre de parties jouees ce jour-la. Les joueurs ayant atteint l'objectif participent automatiquement au tirage au sort organise a la fin du jeu.`;
}

export default function AdminMonthlyChallengePage() {
  const [form, setForm] = useState<MonthlyChallengeConfig>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionCustomized = useRef(false);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await adminFetch("/api/admin/monthly-challenge");
        if (!response.ok) {
          throw new Error("Impossible de charger la configuration du defi mensuel.");
        }
        const { config } = (await response.json()) as { config: Record<string, unknown> | null };
        if (!active || !config) {
          if (active) setLoading(false);
          return;
        }
        setForm({
          enabled: config.enabled === true,
          startDate: toDateTimeLocalInputValue(config.start_date).slice(0, 10),
          endDate: toDateTimeLocalInputValue(config.end_date).slice(0, 10),
          title: readText(config.title),
          description: readText(config.description) || defaultDescription(String(readNumber(config.target_days, 15))),
          targetDays: String(readNumber(config.target_days, 15)),
          prizeTitle: readText(config.prize_title),
          prizeDescription: readText(config.prize_description),
          prizeValue: String(readNumber(config.prize_value, 0)),
          imageUrl: readText(config.image_url),
        });
        descriptionCustomized.current = Boolean(readText(config.description));
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Impossible de charger la configuration du defi mensuel.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
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

  async function uploadChallengeImage(file: File): Promise<string> {
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageRef = ref(
      storage,
      `monthly_challenge/${form.startDate || "config"}/${Date.now()}-${sanitizedFileName}`,
    );
    await uploadBytes(storageRef, file, { contentType: file.type });
    return getDownloadURL(storageRef);
  }

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    setError(null);

    try {
      let imageUrl = form.imageUrl;
      if (imageFile) {
        const validationError = validateImageFile(imageFile);
        if (validationError) {
          throw new Error(validationError);
        }
        imageUrl = await uploadChallengeImage(imageFile);
      }

      const startDatePayload = parseDateTimeLocalToTimestampPayload(`${form.startDate}T00:00`);
      const endDatePayload = parseDateTimeLocalToTimestampPayload(`${form.endDate}T00:00`);
      if (!startDatePayload || !endDatePayload) throw new Error("Les dates de debut et de fin sont obligatoires.");

      const response = await adminFetch("/api/admin/monthly-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.enabled,
          type: "attendance",
          start_date: startDatePayload,
          end_date: endDatePayload,
          title: form.title.trim(),
          description: form.description.trim(),
          target_days: Number(form.targetDays),
          prize_title: form.prizeTitle.trim(),
          prize_description: form.prizeDescription.trim(),
          prize_value: Number(form.prizeValue) || 0,
          image_url: imageUrl,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error?.trim() || "Impossible d'enregistrer le defi mensuel.");
      }

      setForm((prev) => ({ ...prev, imageUrl }));
      setImageFile(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      setFeedback("Defi d'assiduite enregistre.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Impossible d'enregistrer le defi mensuel.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="min-h-full bg-[#F7F7F5]">
        <div className="mx-auto max-w-[900px] px-4 py-8 text-center text-[#666]">
          <div className="loader" aria-hidden="true" />
          <p className="mt-3">Chargement du defi mensuel...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto grid max-w-[900px] gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1a1a1a]">
              Defi d&apos;assiduite (jeu mensuel)
            </h1>
            <p className="mt-1 text-[14px] text-[#666]">
              Un joueur qui joue au moins une fois par jour, pendant le nombre de jours cibles ce
              mois-ci, participe automatiquement au tirage au sort du lot ci-dessous. Une seule
              configuration active a la fois.
            </p>
          </div>
          <Link
            href="/admin/games"
            className="inline-flex items-center justify-center rounded-[10px] border border-[#E8E8E4] bg-white px-5 py-3 text-[14px] font-medium text-[#666] hover:bg-[#F7F7F5]"
          >
            ← Retour aux jeux
          </Link>
        </div>

        <form
          className="rounded-[12px] border border-[#E8E8E4] bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-medium text-[#1a1a1a]">Configuration</h2>
            <label className="flex items-center gap-2 text-[13px] font-medium text-[#666]">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, enabled: event.target.checked }))
                }
                className="h-4 w-4 rounded border-[#E0E0DA]"
              />
              Defi actif
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#666]">Date de debut</span>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="date"
                value={form.startDate}
                onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#666]">Date de fin</span>
              <input className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]" type="date" value={form.endDate} onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))} />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#666]">Objectif en jours actifs</span>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="number"
                min="1"
                value={form.targetDays}
                onChange={(event) => {
                  const targetDays = event.target.value;
                  setForm((current) => ({
                    ...current,
                    targetDays,
                    ...(!descriptionCustomized.current && {
                      description: defaultDescription(targetDays),
                    }),
                  }));
                }}
                placeholder="15"
              />
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[12px] font-medium text-[#666]">Titre (affiche au joueur)</span>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="text"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Bonus d'assiduite"
              />
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[12px] font-medium text-[#666]">Reglement / explication du jeu</span>
              <textarea
                className="resize-y rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                value={form.description}
                onChange={(event) => { descriptionCustomized.current = true; setForm((prev) => ({ ...prev, description: event.target.value })); }}
                rows={3}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#666]">Lot</span>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="text"
                value={form.prizeTitle}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, prizeTitle: event.target.value }))
                }
                placeholder="Un bon d'achat de 50 euros"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#666]">Valeur du lot (€)</span>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.prizeValue}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, prizeValue: event.target.value }))
                }
                placeholder="50"
              />
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[12px] font-medium text-[#666]">Detail du lot</span>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="text"
                value={form.prizeDescription}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, prizeDescription: event.target.value }))
                }
                placeholder="Valable dans tous les commerces partenaires"
              />
            </label>

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

          {error ? <p className="mt-4 text-[13px] text-[#E24B4A]">{error}</p> : null}
          {feedback ? <p className="mt-4 text-[13px] text-[#3B6D11]">{feedback}</p> : null}

          <div className="mt-5">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-[10px] bg-[#639922] px-5 py-3 text-[14px] font-medium text-white hover:bg-[#5a8b1f] disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
