"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { auth } from "@/lib/firebase/auth";
import { db } from "@/lib/firebase/client-app";

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
  description: "",
  prizeTitle: "",
  prizeValue: "",
  prizeDescription: "",
  imageUrl: "",
};

function defaultDescription(days: string, merchantName: string): string {
  return `Jouez sur Proxiplay pendant au moins ${days || "15"} jours differents pendant la periode du jeu pour tenter de gagner un lot chez ${merchantName || "le commercant du mois"}. Une seule journee est comptabilisee par jour. Les joueurs ayant atteint l'objectif participent automatiquement au tirage au sort organise a la fin du jeu.`;
}

function readDate(value: unknown): string {
  const timestamp = value as { seconds?: number; _seconds?: number } | null;
  const seconds = timestamp?.seconds ?? timestamp?._seconds;
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString().slice(0, 10) : "";
}

function readText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export default function MerchantMonthlyChallengePage() {
  const [form, setForm] = useState<MerchantChallengeForm>(initialForm);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
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

  async function save() {
    setError(null);
    setSaved(false);
    const user = auth.currentUser;
    if (!user) {
      setError("Connexion admin requise.");
      return;
    }
    const startDate = new Date(`${form.startDate}T00:00`);
    const endDate = new Date(`${form.endDate}T00:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError("Les dates de debut et de fin sont obligatoires.");
      return;
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
        image_url: form.imageUrl,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      setError(body?.error || "Impossible d'enregistrer le Commercant du mois.");
      return;
    }
    setSaved(true);
  }

  function field(label: string, key: keyof MerchantChallengeForm, type = "text") {
    return <label className="flex flex-col gap-1.5"><span className="text-[12px] font-medium text-[#666]">{label}</span><input className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px]" type={type} value={String(form[key])} onChange={(event) => update(key, event.target.value as never)} /></label>;
  }

  return <section className="min-h-full bg-[#F7F7F5]"><div className="mx-auto grid max-w-[900px] gap-6"><div className="flex justify-between"><div><h1 className="text-[22px] font-medium">Commercant du mois</h1><p className="mt-1 text-[14px] text-[#666]">Configurez la campagne partenaire et son tirage automatique.</p></div><Link href="/admin/games" className="rounded-[10px] border px-5 py-3 text-[14px]">Retour aux jeux</Link></div><form className="rounded-[12px] border bg-white p-5" onSubmit={(event) => { event.preventDefault(); void save(); }}><label className="mb-4 flex gap-2 text-[13px]"><input type="checkbox" checked={form.enabled} onChange={(event) => update("enabled", event.target.checked)} />Defi actif</label><div className="grid gap-4 sm:grid-cols-2">{field("Date de debut", "startDate", "date")}{field("Date de fin", "endDate", "date")}{field("Objectif en jours actifs", "targetDays", "number")}<label className="flex flex-col gap-1.5"><span className="text-[12px] font-medium text-[#666]">Enseigne partenaire</span><select className="rounded-[8px] border px-3 py-2" value={form.enseigneRef.replace("enseignes/", "")} onChange={(event) => selectMerchant(event.target.value)}><option value="">Choisir une enseigne</option>{merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select></label>{field("Titre", "title")}{field("Lot", "prizeTitle")}{field("Valeur du lot", "prizeValue", "number")}{field("Detail du lot", "prizeDescription")}{field("Image", "imageUrl")}</div><label className="mt-4 flex flex-col gap-1.5"><span className="text-[12px] font-medium text-[#666]">Reglement / explication du jeu</span><textarea className="min-h-28 rounded-[8px] border px-3 py-2 text-[14px]" value={form.description} onChange={(event) => update("description", event.target.value)} /></label>{error ? <p className="mt-4 text-[#E24B4A]">{error}</p> : null}{saved ? <p className="mt-4 text-[#3B6D11]">Commercant du mois enregistre.</p> : null}<button className="mt-5 rounded-[10px] bg-[#639922] px-5 py-3 text-white">Enregistrer</button></form></div></section>;
}
