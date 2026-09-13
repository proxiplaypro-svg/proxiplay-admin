"use client";

import { FirebaseError } from "firebase/app";
import { doc, getDoc, Timestamp, updateDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase/client-app";

type PrizeUsageDeadlineEditorProps = {
  gameId: string;
};

type GameDeadlineDocument = {
  end_date?: Timestamp;
  endDate?: Timestamp;
  prize_usage_deadline?: Timestamp;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_VALIDITY_DAYS = 30;
const VALIDITY_OPTIONS = [7, 15, 30, 60, 90];

function getErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      return "Accès admin requis pour modifier la validité du lot.";
    }
    if (error.code === "unavailable") {
      return "Firestore est temporairement indisponible.";
    }
  }
  return "Impossible d'enregistrer la durée de validité du lot.";
}

function endOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export default function PrizeUsageDeadlineEditor({ gameId }: PrizeUsageDeadlineEditorProps) {
  const [gameEndDate, setGameEndDate] = useState<Date | null>(null);
  const [validityDays, setValidityDays] = useState(DEFAULT_VALIDITY_DAYS);
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
        const snapshot = await getDoc(doc(db, "games", gameId));
        if (cancelled) return;

        if (!snapshot.exists()) {
          setError("Jeu introuvable.");
          return;
        }

        const data = snapshot.data() as GameDeadlineDocument;
        const endTimestamp = data.end_date ?? data.endDate;
        const endDate = endTimestamp?.toDate() ?? null;
        setGameEndDate(endDate);

        if (endDate && data.prize_usage_deadline) {
          const deadline = data.prize_usage_deadline.toDate();
          const days = Math.max(1, Math.round((deadline.getTime() - endOfDay(endDate).getTime()) / DAY_MS));
          setValidityDays(days);
        } else {
          setValidityDays(DEFAULT_VALIDITY_DAYS);
        }
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
  }, [gameId]);

  const deadline = useMemo(() => {
    if (!gameEndDate) return null;
    return new Date(endOfDay(gameEndDate).getTime() + validityDays * DAY_MS);
  }, [gameEndDate, validityDays]);

  const options = useMemo(() => {
    return VALIDITY_OPTIONS.includes(validityDays)
      ? VALIDITY_OPTIONS
      : [...VALIDITY_OPTIONS, validityDays].sort((a, b) => a - b);
  }, [validityDays]);

  const handleSave = async () => {
    if (!deadline || saving) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateDoc(doc(db, "games", gameId), {
        prize_usage_deadline: Timestamp.fromDate(deadline),
      });
      setMessage(`Le lot sera utilisable jusqu'au ${formatDate(deadline)}.`);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-6 rounded-[12px] border border-[#E8E8E4] bg-white p-5">
      <div className="mb-4">
        <h2 className="text-[16px] font-medium text-[#1A1A1A]">Validité du lot</h2>
        <p className="mt-1 text-[13px] text-[#777]">
          Le gagnant pourra utiliser son cadeau pendant la durée choisie après la fin du jeu.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,320px)_auto] sm:items-end">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#666]">Durée de validité du lot</span>
          <select
            className="rounded-[8px] border border-[#E0E0DA] bg-white px-3 py-2.5 text-[14px] text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#639922]"
            value={validityDays}
            onChange={(event) => setValidityDays(Number(event.target.value))}
            disabled={loading || saving || !gameEndDate}
          >
            {options.map((days) => (
              <option key={days} value={days}>
                {days} jours
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={loading || saving || !deadline}
          className="inline-flex h-[42px] items-center justify-center rounded-[9px] bg-[#639922] px-5 text-[14px] font-medium text-white hover:bg-[#5A8B1F] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      {gameEndDate && deadline ? (
        <p className="mt-3 text-[12px] text-[#777]">
          Fin du jeu : {formatDate(gameEndDate)} · Cadeau valable jusqu'au {formatDate(deadline)}.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-[13px] text-[#E24B4A]">{error}</p> : null}
      {message ? <p className="mt-3 text-[13px] text-[#3B6D11]">{message}</p> : null}
    </section>
  );
}
