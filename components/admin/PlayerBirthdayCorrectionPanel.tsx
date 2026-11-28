"use client";

import { useState } from "react";
import {
  BIRTHDAY_CORRECTION_REASON_MAX,
  birthdayCorrectionErrorMessage,
  birthdayCorrectionSummary,
  buildBirthdayCorrectionPayload,
  parisTodayKey,
} from "@/lib/admin/playerBirthdayCorrection";
import { correctPlayerBirthdayAction } from "@/lib/firebase/adminActions";

// Outil support minimal : la date de naissance d'un joueur est verrouillee
// dans l'app (1.1.4) ; seule la fonction serveur adminCorrectPlayerBirthday
// peut la corriger, avec un motif obligatoire et une correction journalisee.
// La date actuelle n'est pas affichee ici (minimisation) : le support saisit
// la date communiquee par le joueur.
export function PlayerBirthdayCorrectionPanel({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [birthday, setBirthday] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setBirthday("");
    setReason("");
    setError(null);
  };

  const submit = async () => {
    const checked = buildBirthdayCorrectionPayload({ userId, birthday, reason });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    if (!window.confirm("Corriger la date de naissance de ce joueur ? La correction est journalisée avec votre motif.")) {
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const result = await correctPlayerBirthdayAction(checked.payload);
      setSummary(birthdayCorrectionSummary(result));
      close();
    } catch (err) {
      console.error(err);
      setError(birthdayCorrectionErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-medium text-[#1A1A1A]">Date de naissance</h2>
          <p className="mt-1 text-[12px] text-[#666666]">
            Verrouillée dans l&apos;app une fois enregistrée. Correction par le support uniquement, motif obligatoire.
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => { setOpen(true); setSummary(null); }}
            className="rounded-[8px] border border-[#E0E0DA] bg-white px-4 py-[10px] text-[12px] text-[#1A1A1A] transition hover:bg-[#FAFAF8]"
          >
            Corriger la date de naissance
          </button>
        ) : null}
      </div>

      {summary ? (
        <p role="status" className="mt-3 rounded-[8px] border border-[#C0DD97] bg-[#EAF3DE] px-3 py-2 text-[12px] text-[#3B6D11]">
          {summary}
        </p>
      ) : null}

      {open ? (
        <form
          className="mt-3 grid max-w-[420px] gap-2"
          onSubmit={(event) => { event.preventDefault(); void submit(); }}
        >
          <label className="grid gap-1 text-[12px] text-[#1A1A1A]">
            Nouvelle date de naissance
            <input
              type="date"
              required
              min="1900-01-01"
              max={parisTodayKey()}
              value={birthday}
              onChange={(event) => setBirthday(event.target.value)}
              className="rounded-[8px] border border-[#E0E0DA] bg-white px-3 py-2 text-[12px]"
            />
          </label>
          <label className="grid gap-1 text-[12px] text-[#1A1A1A]">
            Motif (obligatoire)
            <textarea
              required
              maxLength={BIRTHDAY_CORRECTION_REASON_MAX}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="rounded-[8px] border border-[#E0E0DA] bg-white px-3 py-2 text-[12px]"
              placeholder="Ex. : erreur de saisie signalée par le joueur, e-mail du 27/11/2026"
            />
          </label>
          {error ? (
            <p role="alert" className="text-[12px] font-medium text-[#A32D2D]">{error}</p>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-[8px] bg-[#1A1A1A] px-4 py-[10px] text-[12px] font-medium text-white disabled:opacity-50"
            >
              {saving ? "Correction..." : "Enregistrer la correction"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={close}
              className="rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-[10px] text-[12px] text-[#666666]"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
