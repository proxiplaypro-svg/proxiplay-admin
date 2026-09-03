"use client";

import { FirebaseError } from "firebase/app";
import { deleteField, doc, getDoc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client-app";

type GooglePlaceIdEditorProps = {
  merchantId: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      return "Acces admin requis pour modifier l ID Google.";
    }

    if (error.code === "unavailable") {
      return "Firestore est temporairement indisponible.";
    }
  }

  return "Impossible d enregistrer l ID Google.";
}

export default function GooglePlaceIdEditor({ merchantId }: GooglePlaceIdEditorProps) {
  const [googlePlaceId, setGooglePlaceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const snapshot = await getDoc(doc(db, "enseignes", merchantId));
        if (cancelled) return;

        if (!snapshot.exists()) {
          setError("Commercant introuvable.");
          return;
        }

        const value = snapshot.data().google_place_id;
        setGooglePlaceId(typeof value === "string" ? value : "");
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

  const handleSave = async () => {
    if (saving) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const value = googlePlaceId.trim();
      await updateDoc(doc(db, "enseignes", merchantId), {
        google_place_id: value || deleteField(),
      });
      setGooglePlaceId(value);
      setMessage(value ? "ID Google enregistre." : "ID Google supprime.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Google Business</h2>
          <p>Associe cette fiche commercant a sa fiche Google via son Place ID.</p>
        </div>

        <div className="game-edit-grid">
          <label className="game-edit-field game-edit-field-wide">
            <span className="search-label">Google Place ID</span>
            <input
              className="search-input"
              type="text"
              placeholder="Ex. ChIJ..."
              value={googlePlaceId}
              onChange={(event) => setGooglePlaceId(event.target.value)}
              disabled={loading || saving}
            />
            <small className="helper-text">
              Champ Firestore : `google_place_id`. Laisse vide puis enregistre pour supprimer la liaison.
            </small>
          </label>
        </div>

        {error ? (
          <div className="dashboard-banner error">
            <strong>Erreur</strong>
            <p>{error}</p>
          </div>
        ) : null}

        {message ? (
          <div className="dashboard-banner success">
            <strong>Google Business</strong>
            <p>{message}</p>
          </div>
        ) : null}

        <div className="dashboard-actions game-edit-actions">
          <button
            className="primary-button"
            type="button"
            onClick={handleSave}
            disabled={loading || saving}
          >
            {saving ? "Enregistrement..." : "Enregistrer l ID Google"}
          </button>
        </div>
      </div>
    </section>
  );
}
