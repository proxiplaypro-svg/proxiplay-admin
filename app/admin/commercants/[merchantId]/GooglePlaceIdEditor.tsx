"use client";

import { FirebaseError } from "firebase/app";
import { deleteField, doc, getDoc, updateDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useState } from "react";
import { db, firebaseApp } from "@/lib/firebase/client-app";

type GooglePlaceIdEditorProps = {
  merchantId: string;
};

type PlaceResult = {
  placeId: string;
  name: string;
  address: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      return "Accès admin requis pour modifier l’ID Google.";
    }

    if (error.code === "unavailable") {
      return "Firestore est temporairement indisponible.";
    }
  }

  return "Impossible d’enregistrer l’ID Google.";
}

function normalizePlaceResults(payload: unknown): PlaceResult[] {
  if (!payload || typeof payload !== "object") return [];

  const root = payload as Record<string, unknown>;
  const candidates = Array.isArray(root.results)
    ? root.results
    : Array.isArray(root.places)
      ? root.places
      : Array.isArray(root.predictions)
        ? root.predictions
        : Array.isArray(payload)
          ? payload
          : [];

  return candidates
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const value = item as Record<string, unknown>;
      const placeId = String(value.place_id ?? value.placeId ?? value.id ?? "").trim();
      const name = String(
        value.name ??
          value.displayName ??
          value.main_text ??
          value.mainText ??
          value.description ??
          "Résultat Google",
      ).trim();
      const address = String(
        value.formatted_address ??
          value.formattedAddress ??
          value.secondary_text ??
          value.secondaryText ??
          value.address ??
          "",
      ).trim();

      return placeId ? { placeId, name, address } : null;
    })
    .filter((item): item is PlaceResult => Boolean(item));
}

export default function GooglePlaceIdEditor({ merchantId }: GooglePlaceIdEditorProps) {
  const [googlePlaceId, setGooglePlaceId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const functions = useMemo(() => getFunctions(firebaseApp, "us-central1"), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const snapshot = await getDoc(doc(db, "enseignes", merchantId));
        if (cancelled) return;

        if (!snapshot.exists()) {
          setError("Commerçant introuvable.");
          return;
        }

        const data = snapshot.data();
        const value = data.google_place_id;
        setGooglePlaceId(typeof value === "string" ? value : "");

        const initialQuery = [data.name, data.address, data.city]
          .filter((item) => typeof item === "string" && item.trim())
          .join(" ")
          .trim();
        setSearchQuery(initialQuery);
      } catch (loadError) {
        if (!cancelled) setError(getErrorMessage(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [merchantId]);

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (query.length < 3 || searching) return;

    setSearching(true);
    setError(null);
    setMessage(null);
    setResults([]);

    try {
      const searchGooglePlaces = httpsCallable(functions, "searchGooglePlaces");
      const response = await searchGooglePlaces({ query });
      const nextResults = normalizePlaceResults(response.data);
      setResults(nextResults);

      if (nextResults.length === 0) {
        setMessage("Aucun établissement trouvé. Essaie avec le nom + la ville ou l’adresse.");
      }
    } catch (searchError) {
      console.error(searchError);
      setError(
        "La recherche Google n’est pas disponible. Vérifie que la fonction searchGooglePlaces est bien déployée et que la clé Google Places est configurée.",
      );
    } finally {
      setSearching(false);
    }
  };

  const savePlaceId = async (placeId: string) => {
    if (saving) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await updateDoc(doc(db, "enseignes", merchantId), {
        google_place_id: placeId || deleteField(),
      });
      setGooglePlaceId(placeId);
      setMessage(placeId ? "Fiche Google associée." : "Liaison Google supprimée.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-[#E8E8E3] bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-[#1A1A1A]">Google Business</h2>
        <p className="mt-1 text-sm text-[#77776F]">
          Recherche le commerce sur Google puis sélectionne la bonne fiche.
        </p>
      </div>

      <div className="flex flex-col gap-2 md:flex-row">
        <input
          className="h-11 min-w-0 flex-1 rounded-xl border border-[#E2E2DC] bg-[#FAFAF8] px-3.5 text-sm text-[#1A1A1A] outline-none transition placeholder:text-[#A0A098] focus:border-[#79A83B] focus:bg-white focus:ring-2 focus:ring-[#79A83B]/15"
          type="search"
          placeholder="Nom du commerce, adresse ou ville"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleSearch();
            }
          }}
          disabled={loading || searching || saving}
        />
        <button
          className="h-11 shrink-0 rounded-xl bg-[#5B9E25] px-5 text-sm font-medium text-white transition hover:bg-[#4E8B1E] disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={() => void handleSearch()}
          disabled={loading || searching || saving || searchQuery.trim().length < 3}
        >
          {searching ? "Recherche..." : "Rechercher"}
        </button>
      </div>

      {results.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-[#E8E8E3]">
          {results.map((result, index) => (
            <button
              key={`${result.placeId}-${index}`}
              type="button"
              className="flex w-full items-center justify-between gap-4 border-b border-[#EFEFEA] bg-white px-4 py-3 text-left transition last:border-b-0 hover:bg-[#F8FAF4] disabled:opacity-60"
              onClick={() => void savePlaceId(result.placeId)}
              disabled={saving}
            >
              <span className="min-w-0">
                <strong className="block truncate text-sm font-medium text-[#1A1A1A]">{result.name}</strong>
                {result.address ? (
                  <span className="mt-0.5 block truncate text-xs text-[#77776F]">{result.address}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-xs font-medium text-[#5B9E25]">Sélectionner</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#77776F]">
        <span>ID lié :</span>
        {googlePlaceId ? (
          <code className="rounded-md bg-[#F3F3EF] px-2 py-1 text-[#45453F]">{googlePlaceId}</code>
        ) : (
          <span>Aucun</span>
        )}
        {googlePlaceId ? (
          <button
            type="button"
            className="ml-1 font-medium text-[#A33B3B] hover:underline disabled:opacity-50"
            onClick={() => void savePlaceId("")}
            disabled={saving}
          >
            Supprimer la liaison
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 text-sm text-[#A33B3B]">{error}</p>
      ) : null}

      {message ? (
        <p className="mt-3 text-sm text-[#5B7F2C]">{message}</p>
      ) : null}
    </section>
  );
}
