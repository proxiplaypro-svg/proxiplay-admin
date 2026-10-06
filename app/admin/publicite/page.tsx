"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
import { auth } from "@/lib/firebase/auth";
import { db } from "@/lib/firebase/client-app";

type AdPlacement = "open" | "home_banner";

type AdPlacementDoc = {
  enabled: boolean;
  imageUrl: string;
  destinationUrl: string;
  startDate: string;
  endDate: string;
  frequencyCapHours: string;
  impressions: number;
  clicks: number;
};

const EMPTY_DOC: AdPlacementDoc = {
  enabled: false,
  imageUrl: "",
  destinationUrl: "",
  startDate: "",
  endDate: "",
  frequencyCapHours: "",
  impressions: 0,
  clicks: 0,
};

function formatInputDate(value: Timestamp | null | undefined) {
  if (!value) return "";
  const date = value.toDate();
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function parseDateInput(value: string): Timestamp | null {
  return value ? Timestamp.fromDate(new Date(`${value}T00:00:00`)) : null;
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

async function uploadAdImage(placement: AdPlacement, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const formData = new FormData();
  formData.append("file", file);
  formData.append("path", `ads/${placement}/${Date.now()}.${extension}`);

  const response = await adminFetch("/api/admin/upload", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => null)) as
    | { url?: string; error?: string }
    | null;

  if (!response.ok || !payload?.url) {
    throw new Error(payload?.error?.trim() || "Impossible d uploader l image.");
  }

  return payload.url;
}

function formatCtr(impressions: number, clicks: number) {
  if (impressions <= 0) return "—";
  return `${((clicks / impressions) * 100).toFixed(1)}%`;
}

function AdPlacementCard({
  placement,
  title,
  description,
  showFrequencyCap,
}: {
  placement: AdPlacement;
  title: string;
  description: string;
  showFrequencyCap: boolean;
}) {
  const [data, setData] = useState<AdPlacementDoc>(EMPTY_DOC);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "ads", placement),
      (snapshot) => {
        const raw = snapshot.data() as Record<string, unknown> | undefined;
        setLoading(false);

        // Ne pas ecraser une saisie en cours de frappe avec le live-snapshot
        // (les compteurs impressions/clics, eux, doivent toujours se mettre
        // a jour -- ils ne sont jamais edites a la main).
        setData((previous) => ({
          enabled: hasLoadedOnce.current ? previous.enabled : Boolean(raw?.enabled),
          imageUrl: hasLoadedOnce.current ? previous.imageUrl : ((raw?.image_url as string) || ""),
          destinationUrl: hasLoadedOnce.current
            ? previous.destinationUrl
            : ((raw?.destination_url as string) || ""),
          startDate: hasLoadedOnce.current
            ? previous.startDate
            : formatInputDate(raw?.start_at as Timestamp | null | undefined),
          endDate: hasLoadedOnce.current
            ? previous.endDate
            : formatInputDate(raw?.end_at as Timestamp | null | undefined),
          frequencyCapHours: hasLoadedOnce.current
            ? previous.frequencyCapHours
            : raw?.frequency_cap_hours != null
              ? String(raw.frequency_cap_hours)
              : "",
          impressions: typeof raw?.impressions === "number" ? raw.impressions : 0,
          clicks: typeof raw?.clicks === "number" ? raw.clicks : 0,
        }));
        hasLoadedOnce.current = true;
      },
      () => {
        setLoading(false);
        setError("Impossible de charger cet emplacement publicitaire.");
      },
    );

    return () => unsubscribe();
  }, [placement]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    setFeedback(null);
    try {
      const url = await uploadAdImage(placement, file);
      setData((previous) => ({ ...previous, imageUrl: url }));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Upload de l image impossible.");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const startAt = parseDateInput(data.startDate);
      const endAt = parseDateInput(data.endDate);
      if (startAt && endAt && endAt.toMillis() < startAt.toMillis()) {
        throw new Error("La date de fin doit etre posterieure a la date de debut.");
      }

      const frequencyCapHours = showFrequencyCap && data.frequencyCapHours.trim()
        ? Number.parseInt(data.frequencyCapHours, 10)
        : null;
      if (frequencyCapHours != null && (!Number.isFinite(frequencyCapHours) || frequencyCapHours <= 0)) {
        throw new Error("La frequence doit etre un nombre d heures positif.");
      }

      await setDoc(
        doc(db, "ads", placement),
        {
          enabled: data.enabled,
          image_url: data.imageUrl.trim(),
          destination_url: data.destinationUrl.trim(),
          start_at: startAt,
          end_at: endAt,
          ...(showFrequencyCap ? { frequency_cap_hours: frequencyCapHours } : {}),
        },
        { merge: true },
      );
      setFeedback("Enregistre.");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[16px] font-medium text-[#1a1a1a]">{title}</h2>
          <p className="mt-1 text-[13px] text-[#666]">{description}</p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[13px] text-[#1a1a1a]">
          <input
            type="checkbox"
            checked={data.enabled}
            onChange={(event) => setData((previous) => ({ ...previous, enabled: event.target.checked }))}
            className="h-4 w-4"
          />
          Activee
        </label>
      </div>

      {loading ? (
        <div className="mt-6 text-[13px] text-[#999]">Chargement...</div>
      ) : (
        <div className="mt-5 grid gap-4">
          <div>
            <label className="text-[12px] font-medium text-[#666]">Image</label>
            <div className="mt-2 flex items-center gap-4">
              {data.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.imageUrl}
                  alt=""
                  className="h-16 w-28 rounded-[8px] border border-[#E8E8E4] object-cover"
                />
              ) : (
                <div className="flex h-16 w-28 items-center justify-center rounded-[8px] border border-dashed border-[#E0E0DA] text-[11px] text-[#999]">
                  Aucune
                </div>
              )}
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-[7px] border border-[#E8E8E4] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1a1a1a] transition hover:bg-[#F7F7F5] disabled:opacity-50"
              >
                {uploading ? "Envoi..." : "Changer l image"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handleFileChange(event)}
              />
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-[#666]">Destination au clic (URL)</label>
            <input
              type="url"
              value={data.destinationUrl}
              onChange={(event) => setData((previous) => ({ ...previous, destinationUrl: event.target.value }))}
              placeholder="https://..."
              className="mt-1 w-full rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[13px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-[#666]">Debut</label>
              <input
                type="date"
                value={data.startDate}
                onChange={(event) => setData((previous) => ({ ...previous, startDate: event.target.value }))}
                className="mt-1 w-full rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[13px]"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-[#666]">Fin</label>
              <input
                type="date"
                value={data.endDate}
                onChange={(event) => setData((previous) => ({ ...previous, endDate: event.target.value }))}
                className="mt-1 w-full rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[13px]"
              />
            </div>
          </div>

          {showFrequencyCap && (
            <div>
              <label className="text-[12px] font-medium text-[#666]">
                Frequence (heures entre deux affichages par appareil)
              </label>
              <input
                type="number"
                min={1}
                value={data.frequencyCapHours}
                onChange={(event) =>
                  setData((previous) => ({ ...previous, frequencyCapHours: event.target.value }))
                }
                placeholder="ex. 24"
                className="mt-1 w-40 rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[13px]"
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 rounded-[8px] bg-[#F7F7F5] px-4 py-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.06em] text-[#999]">Impressions</div>
              <div className="mt-1 text-[16px] font-medium text-[#1a1a1a]">{data.impressions}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.06em] text-[#999]">Clics</div>
              <div className="mt-1 text-[16px] font-medium text-[#1a1a1a]">{data.clicks}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.06em] text-[#999]">CTR</div>
              <div className="mt-1 text-[16px] font-medium text-[#1a1a1a]">
                {formatCtr(data.impressions, data.clicks)}
              </div>
            </div>
          </div>

          {error && <p className="feedback error">{error}</p>}
          {feedback && !error && <p className="text-[13px] text-[#3B6D11]">{feedback}</p>}

          <div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="rounded-[8px] bg-[#639922] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[#558020] disabled:opacity-50"
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPublicitePage() {
  return (
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto grid max-w-[900px] gap-6">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1a1a1a]">Publicite</h1>
          <p className="mt-1 text-[14px] text-[#666]">
            Publicites vendues en direct par ProxiPlay (pas d AdMob). Tant qu un emplacement n est pas active avec
            une image, rien ne s affiche dans l application -- le systeme est fail-closed sur l activation, et
            fail-open en cas de probleme reseau ou de chargement au moment de l affichage.
          </p>
        </div>

        <AdPlacementCard
          placement="open"
          title="Publicite d ouverture (pleine page)"
          description="Affichee en plein ecran au lancement de l application, au plus une fois par fenetre de frequence et par appareil. N empeche jamais l acces a ProxiPlay en cas d echec de chargement."
          showFrequencyCap
        />

        <AdPlacementCard
          placement="home_banner"
          title="Bandeau Home"
          description="Affiche dans la Home joueur, juste apres le carrousel 'Jeux a la une', sur les 3 variantes de Home (standard, mineur, valeur de lot filtree)."
          showFrequencyCap={false}
        />
      </div>
    </section>
  );
}
